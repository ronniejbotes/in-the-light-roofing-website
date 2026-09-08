/**
 * Bake mirror/ + overrides/ into a folder any static host can serve.
 *
 * Until now the two only ever existed together at runtime: build/serve.mjs
 * injects the overrides into each HTML response as it goes out, which means the
 * whole of overrides/ was invisible to anything that was not the dev server.
 * Uploading the repo got you mirror/ with none of its fixes, and `npm run build`
 * produces dist/ -- the earlier hand-built rebuild, a different codebase
 * entirely. This closes that gap.
 *
 *   npm run publish:mirror        # -> publish/
 *   OUT=_site npm run publish:mirror
 *   PUBLISH_PUBLIC=1 npm run ...  # real robots.txt, no noindex (see below)
 *
 * What it does, in order:
 *   1. copies mirror/ verbatim
 *   2. writes the overrides as real files (_overrides.css, _process.js, ...)
 *   3. copies overrides/assets/ to _assets/
 *   4. injects the same tags serve.mjs injects, into every HTML page
 *   5. writes .htaccess: the redirects, the two fake endpoints, the 404
 *   6. writes a staging robots.txt unless PUBLISH_PUBLIC is set
 *
 * The injected markup mirrors serve.mjs's, with one difference: each URL here
 * carries ?v=<content hash>. The host serves these with a seven-day
 * Cache-Control and sits behind a CDN, so without it a deploy publishes new
 * files that nobody is served -- observed directly, an edge handing out a
 * 28-minute-old _overrides.css while the origin had the new one. The hash
 * changes only when the file does, so caching still works; it just cannot go
 * stale. serve.mjs needs none of this because it sends no-store.
 *
 * If you add an override to serve.mjs, add it to OVERRIDES here too, or it
 * ships working locally and missing in production -- exactly the failure this
 * file exists to fix.
 */
import { readFile, writeFile, mkdir, cp, rm, readdir, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { declutter, rewritePaths } from './declutter.mjs'
import { seo } from './seo/index.mjs'
import { ACTION as FORM_ACTION, HONEYPOT_FIELD, PAGE_FIELD, FIELD_LABELS } from './seo/forms.mjs'
import { existsSync } from 'node:fs'
import { join, resolve, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MIRROR = join(ROOT, 'mirror')
const OVR = join(ROOT, 'overrides')
// resolve(), not join(): an absolute OUT (OUT=C:/somewhere) has to win outright,
// and join() would glue it onto ROOT and produce a path that cannot be created.
const OUT = resolve(ROOT, process.env.OUT || 'publish')
const PUBLIC = process.env.PUBLISH_PUBLIC === '1'

/* Served URL -> file in overrides/. Must match OVERRIDE_FILES in serve.mjs. */
const OVERRIDES = {
  '_overrides.css': 'overrides.css',
  '_overrides.js': 'overrides.js',
  '_reviews.css': 'reviews.css',
  '_reviews.js': 'reviews.js',
  '_process.css': 'process.css',
  '_process.js': 'process.js',
  '_team.css': 'team.css',
  '_team.js': 'team.js',
  '_careers.css': 'careers.css',
  '_careers.js': 'careers.js',
  '_links.css': 'links.css',
  '_perf.css': 'perf.css',
  '_perf.js': 'perf.js',
  '_mobile.css': 'mobile.css',
}

/** Short content hash, so a changed file gets a URL no cache has seen. */
async function stamp(file) {
  const p = join(OVR, file)
  if (!existsSync(p)) return '0'
  return createHash('sha1').update(await readFile(p)).digest('hex').slice(0, 8)
}

/** The same tags serve.mjs injects, each carrying its file's content hash. */
async function buildTags() {
  const v = {}
  for (const [url, file] of Object.entries(OVERRIDES)) v[url] = await stamp(file)
  const css = (u) => `<link rel="stylesheet" href="/${u}?v=${v[u]}">`
  const js = (u) => `<script src="/${u}?v=${v[u]}" defer></script>`
  // mobile.css last: its fixes must win on order over every stylesheet above.
  return css('_overrides.css') + css('_reviews.css') + css('_process.css') + css('_team.css')
    + css('_careers.css') + css('_links.css') + css('_perf.css') + css('_mobile.css')
    + js('_perf.js') + js('_overrides.js') + js('_reviews.js') + js('_process.js') + js('_team.js')
    + js('_careers.js')
}

/** Every file under dir, recursively. */
async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) await walk(p, out)
    else out.push(p)
  }
  return out
}

/**
 * Turn mirror/_redirects into Apache rules.
 *
 * In a .htaccess the match is per-directory, so the pattern has no leading
 * slash. Every rule in the file is an exact path -- no wildcards -- so each
 * becomes one anchored RewriteRule. The optional trailing `/?` lets the
 * un-slashed form redirect too, which is what WordPress does today.
 */
function redirectsToApache(text) {
  const lines = []
  for (const raw of text.split('\n')) {
    const t = raw.trim()
    if (!t || t.startsWith('#')) continue
    const [from, to, code] = t.split(/\s+/)
    if (!from || !to) continue
    const pat = from.replace(/^\//, '').replace(/\/$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    lines.push(`RewriteRule ^${pat}/?$ ${to} [R=${Number(code) || 301},L]`)
  }
  // The source file lists some paths both with and without a trailing slash,
  // because serve.mjs matches them literally. The `/?$` above already covers
  // both forms, so those two collapse to the same rule -- emit it once.
  return [...new Set(lines)]
}

function htaccess(redirectLines) {
  return `# Generated by build/publish.mjs -- do not edit by hand.
#
# Apache/LiteSpeed equivalent of what build/serve.mjs does at runtime.

DirectoryIndex index.html
ErrorDocument 404 /404.html
# A static tree has directories a browser can list; the live site's audit found
# applicants' CVs reachable that way.
Options -Indexes

<IfModule mod_rewrite.c>
  RewriteEngine On

  # --- Canonical host ---------------------------------------------------------
  # www -> bare domain in one hop. Matched on the host so a staging hostname
  # is never redirected onto the live domain, and on the host only so it cannot
  # loop behind a TLS-terminating proxy -- which is also why http -> https is
  # left to the host's own Force-HTTPS setting rather than a %{HTTPS} test.
  # POST is exempt. A 301 turns a POST into a GET and drops the body, so a
  # visitor who reached the page on www would lose the whole submission on its
  # way to ${FORM_ACTION}. Canonicalising is a GET concern; a form post is
  # answered on whichever host served the page it came from.
  RewriteCond %{REQUEST_METHOD} !=POST
  RewriteCond %{HTTP_HOST} ^www\\.inthelightroofing\\.com$ [NC]
  RewriteRule ^ https://inthelightroofing.com%{REQUEST_URI} [R=301,NE,L]

  # --- /index.html -> / -------------------------------------------------------
  # Only when the client literally asked for index.html. THE_REQUEST is the raw
  # request line, which DirectoryIndex does not rewrite, so this cannot loop.
  RewriteCond %{THE_REQUEST} \\s/+(.*/)?index\\.html[\\s?] [NC]
  RewriteRule ^(.*/)?index\\.html$ /%1 [R=301,NE,L]

  # --- Redirects the live site serves, from mirror/_redirects -----------------
${redirectLines.map((l) => '  ' + l).join('\n')}

  # --- Two endpoints the live site answers with PHP --------------------------
  # LiteSpeed's guest-mode script POSTs here on every page load and parses the
  # reply as JSON. Unanswered, the parse throws and takes out the rest of that
  # bundle -- which is what leaves the nav submenus expanded. Answered as a
  # static file: a clone has nothing to reload to, so it declines.
  # Rewritten rather than shipped as guest.vary.php on purpose; a .php file on a
  # PHP-enabled host would be executed rather than served.
  RewriteRule ^litespeed-cache/guest\\.vary\\.php$ /_static/guest.vary.json [L]

  # CallRail's beacon posts visit data to a WordPress REST route. No PHP here to
  # receive it, and an unanswered POST logs an error on every page load.
  RewriteCond %{QUERY_STRING} rest_route=/Calltrk/
  RewriteRule ^index\\.php$ /_static/empty.json [L]
</IfModule>

<IfModule mod_headers.c>
${PUBLIC ? '  # Published as production: no noindex header.' : `  # STAGING. This is a byte-faithful copy of a live client site sitting on a
  # different hostname; indexed, it competes with the real domain. Removed only
  # by publishing with PUBLISH_PUBLIC=1, which is a deliberate act.
  Header set X-Robots-Tag "noindex, nofollow"`}
</IfModule>

<IfModule mod_mime.c>
  AddType image/webp .webp
  AddType image/avif .avif
  AddType font/woff2 .woff2
  AddType video/mp4 .mp4
  AddType video/webm .webm
</IfModule>
`
}

const STAGING_ROBOTS = `# STAGING COPY -- not the live site.
#
# This host serves a byte-faithful clone of https://inthelightroofing.com/. Left
# crawlable it is a duplicate of the client's entire site on a second hostname,
# so everything is disallowed here. The mirror's real robots.txt is restored by
# publishing with PUBLISH_PUBLIC=1.
User-agent: *
Disallow: /
`

/* ---------------------------------------------------------------- the form */

/** A JS value as a PHP literal. Only the shapes build/seo/forms.mjs produces. */
function phpLiteral(v) {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'object') {
    const parts = Object.entries(v).map(([k, x]) => `${phpLiteral(String(k))} => ${phpLiteral(x)}`)
    return parts.length ? `[${parts.join(', ')}]` : '[]'
  }
  return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

/**
 * The form handler, written to publish/_forms/submit.php.
 *
 * It lives here rather than as a checked-in .php file for the same reason
 * guest.vary.json and .htaccess do: it is part of what a publish produces, it
 * has to agree with what seo/forms.mjs stamped into the markup, and a stray
 * .php file in the repo would be served as a download by the dev server and
 * executed by nothing. Generating it also lets the field labels come from the
 * pages that were just transformed instead of a copy that rots.
 *
 * String.raw, because PHP is full of backslashes -- "\r\n", the character
 * classes in the validators -- and a plain template literal would eat every one
 * of them. Nothing in the PHP may contain a backtick or a ${ for the same
 * reason; the only interpolations are the ones written here.
 *
 * What it does and why:
 *   - POST only. A GET is a crawler or someone pasting the URL, not a person.
 *   - The honeypot wins before anything else and answers with the ordinary
 *     success redirect, so a bot cannot tell a rejected post from an accepted
 *     one and cannot learn which field gave it away.
 *   - The originating page comes from HTTP_REFERER, never from the form's own
 *     current_url, which is baked popup markup and wrong on 546 of the 1500
 *     instances. Everything that reaches a Location header is validated as a
 *     same-site path first, so a forged Referer cannot turn this into an open
 *     redirect.
 *   - The careers upload is attached to the mail and never written to disk. The
 *     audit of the live site found applicants' CVs reachable through a
 *     directory listing; a handler that stores nothing cannot repeat that.
 *   - No API key, no secret, no library. It has to keep working after a
 *     PHP upgrade on a host nobody is watching.
 */
function submitPhp(fields) {
  return String.raw`<?php
/**
 * Form handler for the static publish of inthelightroofing.com.
 *
 * GENERATED by build/publish.mjs on every publish. Do not edit this file --
 * edit submitPhp() in build/publish.mjs and republish.
 *
 * Every form on the site posts here: build/seo/forms.mjs sets
 * action="${FORM_ACTION}" on each one and drops the forminator_ajax class that
 * would otherwise send it to WordPress's admin-ajax, which does not exist on a
 * static host.
 */

// Never show a PHP notice to a visitor; the host's error log is where they go.
ini_set('display_errors', '0');
error_reporting(E_ALL);

// The business is in Allentown, PA, so the timestamp in the notification is
// written in the hours the person reading it keeps.
date_default_timezone_set('America/New_York');

$TO = 'info@inthelightroofing.com';
$FROM = 'In The Light Roofing website <info@inthelightroofing.com>';
$THANKS = '/thank-you/';

// A CV, not a video. The extensions are the ones the careers form itself names.
$MAX_UPLOAD = 8388608;
$ALLOWED_EXT = ['avif', 'heif', 'heics', 'heifs', 'pdf', 'docx', 'doc'];

// form id -> field name -> label and option text, harvested from the published
// pages at build time so the email calls every field what the visitor saw.
$FIELDS = ${phpLiteral(fields)};

// Posted with every form and never worth repeating in the email: Forminator's
// plumbing, and the hidden-N fields, which are baked into the mirror and so
// carry the capture machine's IP, the date of the capture and two unresolved
// merge tags rather than anything about this submission.
$MACHINE = ['forminator_nonce', '__referer', 'form_id', 'page_id', 'form_type',
  'current_url', 'render_id', 'action', 'referer_url', 'save_draft', 'form_uid',
  'MAX_FILE_SIZE', '${HONEYPOT_FIELD}', '${PAGE_FIELD}'];

/**
 * A path on this site, or null. Everything that reaches a Location header goes
 * through here first: an absolute URL, a protocol-relative "//elsewhere" or a
 * header-splitting newline is refused outright rather than cleaned up, because
 * a redirector that tries to repair hostile input is how open redirects happen.
 */
function itlr_local_path($url) {
    if (!is_string($url) || $url === '') {
        return null;
    }
    $path = parse_url($url, PHP_URL_PATH);
    if (!is_string($path) || $path === '' || $path[0] !== '/' || substr($path, 0, 2) === '//') {
        return null;
    }
    if (preg_match('#[^A-Za-z0-9/_.~%:@!$&()*+,;=-]#', $path)) {
        return null;
    }
    return $path;
}

/**
 * The page the visitor was on. HTTP_REFERER is the only honest source: the
 * form's own current_url is Elementor's saved popup markup and names the wrong
 * page on more than a third of the instances. The itlr_page field
 * build/seo/forms.mjs stamps in is the fallback for the browsers and privacy
 * settings that send no referer at all.
 */
function itlr_page() {
    $host = isset($_SERVER['HTTP_HOST']) ? preg_replace('/:\d+$/', '', $_SERVER['HTTP_HOST']) : '';
    $ref = isset($_SERVER['HTTP_REFERER']) ? $_SERVER['HTTP_REFERER'] : '';
    if (is_string($ref) && $ref !== '') {
        $parts = parse_url($ref);
        $refHost = (is_array($parts) && isset($parts['host'])) ? $parts['host'] : '';
        if ($refHost === '' || ($host !== '' && strcasecmp($refHost, $host) === 0)) {
            $path = itlr_local_path($ref);
            if ($path !== null) {
                return $path;
            }
        }
    }
    // build/seo/forms.mjs stamps a bare path and nothing else, so a value that
    // carries a scheme or a host did not come from the markup and is not
    // trusted to name the page. Refused rather than reduced to its path: a
    // "//elsewhere.example/contact/" would otherwise pass as "/contact/".
    $raw = isset($_POST['${PAGE_FIELD}']) ? $_POST['${PAGE_FIELD}'] : '';
    if (is_string($raw) && $raw !== '' && $raw[0] === '/' && substr($raw, 0, 2) !== '//') {
        $stamped = itlr_local_path($raw);
        if ($stamped !== null) {
            return $stamped;
        }
    }
    return '/';
}

/** 303, so the browser turns the POST into a GET and a refresh cannot resubmit. */
function itlr_redirect($path) {
    header('Cache-Control: no-store');
    header('Location: ' . $path, true, 303);
    exit;
}

/** Back to the page the visitor was on, which shows nothing until someone styles ?form=error. */
function itlr_fail($page) {
    itlr_redirect($page . (strpos($page, '?') === false ? '?' : '&') . 'form=error');
}

/** Multi-line text with the control characters and the stray carriage returns taken out. */
function itlr_text($value) {
    if (!is_string($value)) {
        return '';
    }
    $value = str_replace(["\0", "\r\n", "\r"], ['', "\n", "\n"], $value);
    $value = preg_replace('/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/', '', $value);
    return trim($value);
}

/** One line of text. Also what makes a value safe to put in a mail header. */
function itlr_line($value) {
    return trim(str_replace("\n", ' ', itlr_text($value)));
}

/** Cut to a byte length without splitting a UTF-8 character in half. */
function itlr_cut($value, $max) {
    if (strlen($value) <= $max) {
        return $value;
    }
    if (function_exists('mb_substr')) {
        return mb_substr($value, 0, $max, 'UTF-8');
    }
    return preg_replace('/[\x80-\xBF]*$/', '', substr($value, 0, $max));
}

/* ------------------------------------------------------------------------ */

if (!isset($_SERVER['REQUEST_METHOD']) || strtoupper($_SERVER['REQUEST_METHOD']) !== 'POST') {
    http_response_code(405);
    header('Allow: POST');
    header('Content-Type: text/plain; charset=UTF-8');
    echo "This address accepts form submissions only.\n";
    exit;
}

$page = itlr_page();

// A post larger than the host's post_max_size arrives with $_POST and $_FILES
// emptied and no warning of its own. Say so here rather than letting it fall
// through and look like an empty form.
if (empty($_POST) && isset($_SERVER['CONTENT_LENGTH']) && (int) $_SERVER['CONTENT_LENGTH'] > 0) {
    itlr_fail($page);
}

// The bot trap, before any validation. A filled-in honeypot gets the same
// answer a real submission gets, so nothing is learned from the difference.
if (itlr_line(isset($_POST['${HONEYPOT_FIELD}']) ? $_POST['${HONEYPOT_FIELD}'] : '') !== '') {
    itlr_redirect($THANKS);
}

$name = itlr_cut(itlr_line(isset($_POST['name-1']) ? $_POST['name-1'] : ''), 200);
$phone = itlr_cut(itlr_line(isset($_POST['phone-1']) ? $_POST['phone-1'] : ''), 200);
$email = itlr_cut(itlr_line(isset($_POST['email-1']) ? $_POST['email-1'] : ''), 250);

// A name and one way to answer. Nothing else on any of the five forms is worth
// turning a person away over.
if ($name === '') {
    itlr_fail($page);
}
if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    itlr_fail($page);
}
if ($phone === '' && $email === '') {
    itlr_fail($page);
}

$formId = preg_replace('/[^0-9]/', '', itlr_line(isset($_POST['form_id']) ? $_POST['form_id'] : ''));
$known = isset($FIELDS[$formId]) ? $FIELDS[$formId] : [];

// The form's own name for itself, for the subject line. It arrives from the
// client like everything else, so it is cut back to a short label.
$formName = preg_replace('/[^A-Za-z0-9 &\/\'-]/', '', itlr_line(isset($_POST['hidden-4']) ? $_POST['hidden-4'] : ''));
$formName = trim(preg_replace('/\s+/', ' ', $formName));
if ($formName === '') {
    $formName = 'Website form';
}
$formName = substr($formName, 0, 40);

/* ---------------------------------------------------------------- the body */

$inline = [];
$blocks = [];
$seen = [];

// The form's own fields first, in the order they appear on the page, labelled
// the way the page labels them and with a dropdown's visible text in place of
// the value it posts -- the careers dropdown sends "Roof-Inspections" for
// "Inside Sales Representative".
foreach ($known as $field => $meta) {
    $seen[$field] = true;
    if (!isset($_POST[$field]) || !is_string($_POST[$field])) {
        continue;
    }
    $value = itlr_cut(itlr_text($_POST[$field]), 20000);
    if ($value === '') {
        continue;
    }
    if (isset($meta['options']) && isset($meta['options'][$value])) {
        $value = $meta['options'][$value];
    }
    $label = (isset($meta['label']) && $meta['label'] !== '') ? $meta['label'] : $field;
    if (strpos($value, "\n") === false) {
        $inline[] = [$label, $value];
    } else {
        $blocks[] = [$label, $value];
    }
}

// Anything else a form grows later still reaches the inbox, under its own name.
foreach ($_POST as $field => $value) {
    if (isset($seen[$field]) || !is_string($field) || !is_string($value)) {
        continue;
    }
    // apbct_* and ct_* are CleanTalk's, added to the form by its own script as
    // the visitor types. One of them is a five-kilobyte base64 blob of
    // telemetry for a service that has no server side here.
    if (in_array($field, $MACHINE, true) || strpos($field, 'hidden-') === 0
        || strpos($field, 'apbct') === 0 || strpos($field, 'ct_') === 0) {
        continue;
    }
    $value = itlr_cut(itlr_text($value), 20000);
    if ($value === '') {
        continue;
    }
    if (strpos($value, "\n") === false) {
        $inline[] = [$field, $value];
    } else {
        $blocks[] = [$field, $value];
    }
}

/* ---------------------------------------------------------- the attachment */

$attachment = null;
if (isset($_FILES['upload-1']) && is_array($_FILES['upload-1'])
    && isset($_FILES['upload-1']['error']) && !is_array($_FILES['upload-1']['error'])
    && (int) $_FILES['upload-1']['error'] !== UPLOAD_ERR_NO_FILE) {
    $file = $_FILES['upload-1'];
    if ((int) $file['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($file['tmp_name'])) {
        itlr_fail($page);
    }
    $size = (int) $file['size'];
    if ($size <= 0 || $size > $MAX_UPLOAD) {
        itlr_fail($page);
    }
    // The client filename is used for one thing only, its extension, and even
    // that is taken after the path separators are stripped out of it. The name
    // the attachment is sent under is built here.
    $client = str_replace('\\', '/', (string) $file['name']);
    $ext = strtolower(pathinfo(basename($client), PATHINFO_EXTENSION));
    if (!in_array($ext, $ALLOWED_EXT, true)) {
        itlr_fail($page);
    }
    $bytes = file_get_contents($file['tmp_name']);
    if ($bytes === false || strlen($bytes) === 0) {
        itlr_fail($page);
    }
    $slug = trim(strtolower(preg_replace('/[^A-Za-z0-9]+/', '-', $name)), '-');
    if ($slug === '') {
        $slug = 'attachment';
    }
    $attachment = ['name' => substr($slug, 0, 40) . '-' . date('Ymd-His') . '.' . $ext, 'bytes' => $bytes];
}

/* ---------------------------------------------------------------- the mail */

$width = 0;
foreach ($inline as $row) {
    $width = max($width, strlen($row[0]));
}
$width = max($width, 9);

$body = 'New ' . $formName . ' submission from ' . $page . "\n\n";
foreach ($inline as $row) {
    $body .= str_pad($row[0] . ':', $width + 2) . $row[1] . "\n";
}
foreach ($blocks as $row) {
    $body .= "\n" . $row[0] . "\n" . str_repeat('-', strlen($row[0])) . "\n" . $row[1] . "\n";
}
if ($attachment !== null) {
    $body .= "\n" . 'Attached: ' . $attachment['name'] . "\n";
}
$body .= "\n" . str_repeat('-', 40) . "\n";
$body .= str_pad('Page:', $width + 2) . $page . "\n";
$body .= str_pad('Received:', $width + 2) . date('Y-m-d H:i:s T') . "\n";
if (isset($_SERVER['REMOTE_ADDR'])) {
    $body .= str_pad('From IP:', $width + 2) . itlr_line($_SERVER['REMOTE_ADDR']) . "\n";
}

$subject = itlr_line('In The Light Roofing: ' . $formName . ' from ' . $page);

$boundary = 'itlr-' . (function_exists('random_bytes') ? bin2hex(random_bytes(12)) : md5(uniqid('', true)));

$headers = ['From: ' . $FROM];
if ($email !== '') {
    // So hitting reply answers the person who filled the form in.
    $headers[] = 'Reply-To: ' . itlr_line($email);
}
$headers[] = 'MIME-Version: 1.0';

if ($attachment === null) {
    $headers[] = 'Content-Type: text/plain; charset=UTF-8';
    $headers[] = 'Content-Transfer-Encoding: base64';
    // base64 rather than 8bit: it is the only encoding that cannot be tripped
    // up by a long line or a mail server that rewrites one.
    $message = chunk_split(base64_encode($body), 76, "\r\n");
} else {
    $headers[] = 'Content-Type: multipart/mixed; boundary="' . $boundary . '"';
    $message = '--' . $boundary . "\r\n"
        . "Content-Type: text/plain; charset=UTF-8\r\n"
        . "Content-Transfer-Encoding: base64\r\n\r\n"
        . chunk_split(base64_encode($body), 76, "\r\n") . "\r\n"
        . '--' . $boundary . "\r\n"
        . 'Content-Type: application/octet-stream; name="' . $attachment['name'] . "\"\r\n"
        . "Content-Transfer-Encoding: base64\r\n"
        . 'Content-Disposition: attachment; filename="' . $attachment['name'] . "\"\r\n\r\n"
        . chunk_split(base64_encode($attachment['bytes']), 76, "\r\n") . "\r\n"
        . '--' . $boundary . "--\r\n";
}

if (!mail($TO, $subject, $message, implode("\r\n", $headers))) {
    itlr_fail($page);
}

itlr_redirect($THANKS);
`
}

async function main() {
  if (!existsSync(MIRROR)) throw new Error('mirror/ not found -- nothing to publish')

  if (existsSync(OUT)) await rm(OUT, { recursive: true, force: true })
  await mkdir(OUT, { recursive: true })

  // 1. The mirror, verbatim.
  await cp(MIRROR, OUT, { recursive: true })

  // 2. The overrides, as the URLs serve.mjs exposes them.
  let wrote = 0
  for (const [url, file] of Object.entries(OVERRIDES)) {
    const src = join(OVR, file)
    if (!existsSync(src)) { console.warn(`  ! missing override: ${file}`); continue }
    await cp(src, join(OUT, url))
    wrote++
  }

  // 3. Images the overrides bring with them.
  const assets = join(OVR, 'assets')
  let assetCount = 0
  if (existsSync(assets)) {
    await cp(assets, join(OUT, '_assets'), { recursive: true })
    assetCount = (await readdir(assets)).length
  }

  // 3b. Strip the WordPress fingerprints.
  //
  // After the overrides are copied, deliberately: overrides.css targets
  // `img.wp-image-5320`, and the class rename has to reach that rule as well as
  // the markup or the service-grid icon sizing silently stops applying. Running
  // it here keeps both sides of every rename in step.
  // DECLUTTER=off publishes the mirror's own WordPress markup untouched. Kept
  // as the comparison baseline and the way back if a rename ever misfires.
  const clean = process.env.DECLUTTER === 'off'
    ? { movedDirs: [], rewritten: 0, htmlCleaned: 0, skipped: true }
    : await declutter(OUT)

  // 3c. The SEO pass: schema, canonicals, indexability, titles and descriptions,
  // alt text, internal links, sitemap and the live robots.txt. After declutter
  // so it sees the renamed /assets/ paths, and before the tag injection so the
  // pages it reads are still the mirror's own markup. See build/seo/index.mjs.
  // SEO=off publishes without it -- the untouched-mirror baseline.
  const seoReport = process.env.SEO === 'off'
    ? { modules: [], pages: 0, skipped: true }
    : await seo(OUT, { public: PUBLIC })

  // 4. Inject into every HTML document.
  //
  // Not every .html here is a document: WordPress serves its feeds at
  // extension-less URLs, so they land in index.html files too. serve.mjs sniffs
  // the payload rather than trusting the name, and so does this -- injecting a
  // stylesheet link into an RSS feed produces a file no reader can parse.
  const TAGS = await buildTags()
  let injected = 0
  let skippedXml = 0
  for (const f of await walk(OUT)) {
    if (!f.endsWith('.html')) continue
    const body = await readFile(f, 'utf8')
    if (body.slice(0, 5) === '<?xml') { skippedXml++; continue }
    const i = body.lastIndexOf('</head>')
    await writeFile(f, i === -1 ? body + TAGS : body.slice(0, i) + TAGS + body.slice(i), 'utf8')
    injected++
  }

  // 5. Host config, and the two static answers it points at.
  let redirectedDrafts = 0
  const redirFile = join(MIRROR, '_redirects')
  // Through the same path mapping as everything else: _redirects still names
  // /wp-content/, and the .htaccess is written after the declutter pass, so
  // without this one rule would 301 into a directory that no longer exists.
  // Two saved drafts of the homepage were published as pages of their own and
  // then linked from the navigation and from "Related Posts". They are the
  // homepage; serve the homepage. Appended to the copied _redirects too, so the
  // local preview (which reads that file) behaves like the host.
  const EXTRA_REDIRECTS = [
    ['/home/', '/', 301],
    ['/home-in-the-light-roofing-new-design/', '/', 301],
  ]
  const redirectText = (existsSync(redirFile) ? rewritePaths(await readFile(redirFile, 'utf8')) : '')
    + '\n' + EXTRA_REDIRECTS.map((r) => r.join(' ')).join('\n') + '\n'
  await writeFile(join(OUT, '_redirects'), redirectText, 'utf8')

  // ...and take the two drafts out of the tree, or on the hosts DEPLOY.md names
  // the redirect above never fires. Netlify and Cloudflare Pages both serve a
  // real file in preference to a `_redirects` rule, and neither honours a
  // forced-redirect marker that Apache would also accept -- so the only fix
  // that works on every host is for the file not to be there. Nothing links to
  // them any more (seo/content.mjs rewrites the nav and Related Posts hrefs to
  // `/`) and the sitemap has never listed them, so this drops ~1.3MB of pages
  // that exist only to be redirected away from.
  for (const [from] of EXTRA_REDIRECTS) {
    const dir = join(OUT, from.replace(/^\/|\/$/g, ''))
    if (existsSync(dir)) { await rm(dir, { recursive: true, force: true }); redirectedDrafts++ }
  }
  const rules = redirectsToApache(redirectText)
  await writeFile(join(OUT, '.htaccess'), htaccess(rules), 'utf8')
  await mkdir(join(OUT, '_static'), { recursive: true })
  await writeFile(join(OUT, '_static', 'guest.vary.json'), '{"reload":"no"}', 'utf8')
  await writeFile(join(OUT, '_static', 'empty.json'), '{}', 'utf8')

  // The one endpoint on this site that is not a static file. Written after the
  // SEO pass so its field labels are the ones seo/forms.mjs just read off the
  // pages, and after the injection loop so nothing tries to put a stylesheet
  // link in it. .htaccess above leaves it alone: Options -Indexes hides the
  // directory, and no rewrite rule matches a path under /_forms/.
  await mkdir(join(OUT, '_forms'), { recursive: true })
  await writeFile(join(OUT, '_forms', 'submit.php'), submitPhp(FIELD_LABELS), 'utf8')

  // The mirror has no 404 page of its own; without one Apache shows its stock
  // error page, which does not look like this site at all.
  if (!existsSync(join(OUT, '404.html'))) {
    await writeFile(join(OUT, '404.html'),
      '<!doctype html><html lang="en-US"><head><meta charset="utf-8">'
      + '<meta name="viewport" content="width=device-width,initial-scale=1">'
      + '<title>Page not found | In The Light Roofing</title>'
      + '<meta name="robots" content="noindex">'
      + '<style>body{margin:0;min-height:100vh;display:grid;place-items:center;'
      + 'font:16px/1.6 system-ui,sans-serif;background:#14161E;color:#fff;text-align:center;padding:24px}'
      + 'a{color:#00B6F1}</style></head><body><div><h1>Page not found</h1>'
      + '<p>That page is not here. <a href="/">Back to the homepage</a></p></div></body></html>',
      'utf8')
  }

  // 6. Keep a staging clone out of the index unless told otherwise.
  if (!PUBLIC) await writeFile(join(OUT, 'robots.txt'), STAGING_ROBOTS, 'utf8')

  const files = (await walk(OUT)).length
  console.log(`\npublished -> ${relative(ROOT, OUT)}/`)
  console.log(`  ${files} files`)
  console.log(`  ${injected} HTML pages injected  (${skippedXml} feeds left alone)`)
  console.log(`  ${wrote} override files, ${assetCount} assets`)
  console.log(`  ${rules.length} redirects written to .htaccess` + (redirectedDrafts ? `, ${redirectedDrafts} redirected duplicate pages removed` : ''))
  const mappedForms = Object.keys(FIELD_LABELS).length
  console.log(`  form handler: _forms/submit.php -> info@inthelightroofing.com`
    + (mappedForms ? `, field labels for ${mappedForms} forms` : ', no field labels (SEO pass skipped)'))
  console.log(`  de-WordPressed: ${clean.movedDirs.length} dirs moved, `
    + `${clean.rewritten} files rewritten, ${clean.htmlCleaned} pages cleaned`)
  if (clean.wpContentLeftovers) console.warn('  ! wp-content not empty:', clean.wpContentLeftovers)
  console.log(seoReport.skipped
    ? '  SEO pass: skipped (SEO=off)'
    : `  SEO pass: ${seoReport.modules.length ? seoReport.modules.join(', ') : 'no modules'} over ${seoReport.pages} pages`)
  for (const [mod, rep] of Object.entries(seoReport.report || {})) {
    const line = Object.entries(rep).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join('  ')
    if (line) console.log(`    ${mod}: ${line}`)
  }
  console.log(PUBLIC
    ? '  robots.txt: the mirror\'s own (PUBLISH_PUBLIC=1)'
    : '  robots.txt: STAGING, disallow all + X-Robots-Tag noindex')
  console.log(`\nUpload the contents of ${relative(ROOT, OUT)}/ to the web root.\n`)
}

main().catch((e) => { console.error(e); process.exit(1) })
