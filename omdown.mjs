/**
 * DIKELOLA     : Omnify Labs
 * DESCRIPTION  : Extract semua format + URL download per format dari omdown.site
 * USAGE        : node omdown.mjs <link> [options]
 * CREATOR FILE : Skipp Mas No WM
 *
 * OPTIONS:
 *   --headed       Tampilkan browser (default: headless)
 *   --slow         Slow-motion 300ms (debug)
 *   --dump         Log verbose ke stderr
 *   --max=N        Max format yang di-capture URL-nya (default: 0 = semua)
 *   --help         Bantuan
 **/

import { chromium } from 'playwright';
import { argv, exit } from 'node:process';

/* ============================================================
 *  PLATFORM DETECTION
 * ============================================================ */

function detectPlatform(url) {
    if (/spotify\.com/i.test(url)) {
        if (/\/playlist\//i.test(url)) return { name: 'Spotify', subtype: 'playlist' };
        if (/\/album\//i.test(url)) return { name: 'Spotify', subtype: 'album' };
        if (/\/track\//i.test(url)) return { name: 'Spotify', subtype: 'track' };
        return { name: 'Spotify', subtype: null };
    }
    if (/instagram\.com/i.test(url)) return { name: 'Instagram', subtype: null };
    if (/tiktok\.com/i.test(url)) return { name: 'TikTok', subtype: null };
    if (/youtube\.com|youtu\.be/i.test(url)) return { name: 'YouTube', subtype: null };
    if (/facebook\.com|fb\.watch/i.test(url)) return { name: 'Facebook', subtype: null };
    if (/twitter\.com|x\.com/i.test(url)) return { name: 'X', subtype: null };
    if (/pinterest\./i.test(url)) return { name: 'Pinterest', subtype: null };
    if (/snapchat\.com/i.test(url)) return { name: 'Snapchat', subtype: null };
    if (/linkedin\.com/i.test(url)) return { name: 'LinkedIn', subtype: null };
    if (/threads\.net/i.test(url)) return { name: 'Threads', subtype: null };
    if (/soundcloud\.com/i.test(url)) return { name: 'SoundCloud', subtype: null };
    if (/dailymotion\.com/i.test(url)) return { name: 'Dailymotion', subtype: null };
    if (/vimeo\.com/i.test(url)) return { name: 'Vimeo', subtype: null };
    if (/reddit\.com/i.test(url)) return { name: 'Reddit', subtype: null };
    if (/twitch\.tv/i.test(url)) return { name: 'Twitch', subtype: null };
    return { name: 'Unknown', subtype: null };
}

/* ============================================================
 *  PARSERS
 * ============================================================ */

function parseSize(text) {
    if (!text) return null;
    const m = String(text).match(/([\d.]+)\s*(B|KB|MB|GB)/i);
    if (!m) return null;
    const value = parseFloat(m[1]);
    const unit = m[2].toUpperCase();
    const bytes =
        unit === 'GB' ? value * 1024 ** 3 :
        unit === 'MB' ? value * 1024 ** 2 :
        unit === 'KB' ? value * 1024 :
        value;
    return { value, unit, bytes: Math.round(bytes), text: String(text).trim() };
}

function parseDuration(text) {
    if (!text) return null;
    const m = String(text).match(/(\d+):(\d{1,2})(?::(\d{1,2}))?/);
    if (!m) return null;
    const seconds = m[3]
        ? parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3])
        : parseInt(m[1]) * 60 + parseInt(m[2]);
    return {
        text: String(text).trim(),
        seconds,
        formatted: m[3]
            ? `${m[1]}:${m[2].padStart(2, '0')}:${m[3].padStart(2, '0')}`
            : `${m[1]}:${m[2].padStart(2, '0')}`,
    };
}

function detectQuality(text) {
    if (!text) return null;
    const t = String(text);

    if (/\b4K\b|2160p/i.test(t)) return { label: '4K', height: 2160 };
    if (/\b2K\b|1440p/i.test(t)) return { label: '2K', height: 1440 };
    if (/\b1080p\b|full\s*hd/i.test(t)) return { label: '1080p', height: 1080 };
    if (/\b720p\b/i.test(t)) return { label: '720p', height: 720 };
    if (/\b480p\b/i.test(t)) return { label: '480p', height: 480 };
    if (/\b360p\b/i.test(t)) return { label: '360p', height: 360 };
    if (/\b240p\b/i.test(t)) return { label: '240p', height: 240 };
    if (/\b144p\b/i.test(t)) return { label: '144p', height: 144 };

    const pMatch = t.match(/(\d{3,4})p\b/i);
    if (pMatch) return { label: `${pMatch[1]}p`, height: parseInt(pMatch[1]) };

    if (/studio\s*master/i.test(t)) return { label: 'Studio Master', height: null };
    if (/kualitas\s+asli/i.test(t)) return { label: 'Original', height: null };
    if (/320\s*kbps/i.test(t)) return { label: '320 kbps', height: null };
    if (/kualitas\s+terbaik/i.test(t)) return { label: 'Best Quality', height: null };

    return null;
}

function detectFormatType(title, meta) {
    const t = `${title || ''} ${meta || ''}`.toLowerCase();
    if (/tanpa\s+watermark/.test(t)) return 'video_no_watermark';
    if (/dengan\s+watermark/.test(t)) return 'video_with_watermark';
    if (/audio.*dari.*video|video.*audio/.test(t)) return 'audio_from_video';
    if (/sound.*musik|musik.*sound/.test(t)) return 'audio_music';
    if (/lagu\s+lengkap|full\s+song/i.test(t)) return 'audio_full_song';
    if (/spotify\s+track/i.test(t)) return 'audio_spotify';
    if (/audio\s*mp3/i.test(t)) return 'audio';
    if (/sampul|thumbnail|foto\s+sampul/i.test(t)) return 'image';
    if (/video\s*mp4|\.mp4/i.test(t)) return 'video';
    if (/image|foto|gambar|\.jpg|\.png/i.test(t)) return 'image';
    if (/audio|lagu|song|track|\.mp3/i.test(t)) return 'audio';
    return 'unknown';
}

function detectCategory(type) {
    if (type === 'video' || type === 'video_no_watermark' || type === 'video_with_watermark') return 'video';
    if (type === 'audio' || type === 'audio_music' || type === 'audio_from_video' || type === 'audio_full_song' || type === 'audio_spotify') return 'audio';
    if (type === 'image') return 'image';
    return 'other';
}

/* ============================================================
 *  STRICT DOWNLOAD URL VALIDATOR
 * ============================================================ */

function isRealDownloadUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const u = url.toLowerCase();

    if (/\/icons?\//i.test(u)) return false;
    if (/\/logo/i.test(u)) return false;
    if (/logo\.(svg|png|jpg|jpeg|webp|gif)/i.test(u)) return false;
    if (/favicon/i.test(u)) return false;
    if (/\/_next\/static\//i.test(u)) return false;
    if (/\/assets?\/(img|image|icon|font|css|js)/i.test(u)) return false;
    if (/\/images?\/(brand|icons?|logo|mascot)/i.test(u)) return false;
    if (/mascot/i.test(u)) return false;
    if (/\.(css|js|woff2?|ttf|eot|map)($|\?)/i.test(u)) return false;

    if (/\/api\/(media\/)?download/i.test(u)) return true;
    if (/\/api\/media\/file/i.test(u)) return true;
    if (/\.(mp4|mp3|m4a|webm|mov|mkv|aac|ogg)($|\?)/i.test(u)) return true;
    if (/[?&]download=1/i.test(u)) return true;
    if (/\/download\/[^/]+\?/i.test(u) && /token=/i.test(u)) return true;

    return false;
}

/* ============================================================
 *  MAIN CLASS
 * ============================================================ */

class OMDownload {
    constructor() {
        this.siteUrl = 'https://www.omdown.site/id';
        this.origin = 'https://www.omdown.site';
        this.ua =
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
            '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
        this.navTimeout = 60_000;
    }

    /* ── Parse #res ── */
    async parseResultSection(page) {
        return await page.evaluate(() => {
            const res =
                document.querySelector('#res') ||
                document.querySelector('section.result');
            if (!res) return null;

            const title =
                document.querySelector('#rt')?.textContent?.trim() || null;

            const author =
                res.querySelector('.badge-author-name')?.textContent?.trim() || null;

            const thumbImg = res.querySelector('.thumb-img');
            const thumbnailRaw = thumbImg?.getAttribute('src') || null;
            const thumbnail = thumbnailRaw
                ? new URL(thumbnailRaw, window.location.origin).href
                : null;

            const durationEl = res.querySelector('.dur');
            const duration = durationEl?.textContent?.trim() || null;

            const musicEl = res.querySelector('.badge-music');
            let music = null;
            if (musicEl) {
                music = {
                    title: musicEl.getAttribute('title') || null,
                    text:
                        musicEl.querySelector('span:not([class])')?.textContent?.trim() ||
                        null,
                };
            }

            const stats = {};
            res.querySelectorAll('.stat-item').forEach((item) => {
                const label = item.querySelector('.stat-lbl')?.textContent?.trim();
                const num = item.querySelector('.stat-num')?.textContent?.trim();
                if (label) stats[label] = num;
            });

            const tabs = Array.from(res.querySelectorAll('.fmt-tab-btn')).map(
                (tab) => (tab.textContent || '').trim()
            );

            const formats = Array.from(res.querySelectorAll('.fmt-card')).map(
                (card, index) => {
                    const title =
                        card.querySelector('.fmt-card-title')?.textContent?.trim() ||
                        null;
                    const meta =
                        card.querySelector('.fmt-card-meta')?.textContent?.trim() ||
                        null;
                    const size =
                        card.querySelector('.fmt-card-size')?.textContent?.trim() ||
                        null;

                    let formatDuration = null;
                    if (title) {
                        const m = title.match(/\((\d+:\d{1,2}(?::\d{1,2})?)\)/);
                        if (m) formatDuration = m[1];
                    }

                    return {
                        index,
                        title,
                        meta,
                        size,
                        formatDuration,
                        active: card.classList.contains('fmt-card-active'),
                    };
                }
            );

            const tokens = [];
            const tokenRegex = /token=([^&]+)/g;
            const scanTokens = (src) => {
                if (!src) return;
                let m;
                while ((m = tokenRegex.exec(src)) !== null) {
                    if (!tokens.includes(m[1])) tokens.push(m[1]);
                }
            };
            scanTokens(thumbnailRaw);
            scanTokens(
                res.querySelector('.badge-author-avatar-img')?.getAttribute('src')
            );

            return {
                title,
                author,
                thumbnail,
                thumbnailRaw,
                duration,
                music,
                stats,
                tabs,
                formats,
                tokens,
            };
        });
    }

    /* ── Capture URL per format (event-driven, no polling) ── */
    async captureUrlForFormat(page, formatIndex, options = {}) {
        const log = options.log || (() => {});
        const waitTimeout = options.waitTimeout ?? 3000;

        // 1. Klik format card
        const clicked = await page.evaluate((idx) => {
            const cards = document.querySelectorAll('#res .fmt-card');
            if (!cards[idx]) return false;
            cards[idx].click();
            return true;
        }, formatIndex);

        if (!clicked) return null;

        // 2. Tunggu card jadi active (event-based, bukan fixed 600ms)
        await page
            .waitForFunction(
                (idx) => {
                    const cards = document.querySelectorAll('#res .fmt-card');
                    return cards[idx]?.classList.contains('fmt-card-active');
                },
                formatIndex,
                { timeout: 2500, polling: 100 }
            )
            .catch(() => {});

        // 3. Setup capture dengan resolver
        const captured = {
            url: null,
            filename: null,
            size: 0,
            contentType: null,
            source: null,
        };

        let resolveCapture;
        const capturePromise = new Promise((r) => { resolveCapture = r; });

        const promote = (url, source, extra = {}) => {
            if (captured.url) return false;
            captured.url = url;
            captured.source = source;
            Object.assign(captured, extra);
            log(`  ✅ [${formatIndex}] captured (${source}): ${url.slice(0, 90)}`);
            resolveCapture();
            return true;
        };

        const responseListener = (res) => {
            if (captured.url) return;
            const status = res.status();
            if (status !== 200) return;

            const url = res.url();
            const headers = res.headers();
            const ct = (headers['content-type'] || '').toLowerCase();
            const cd = headers['content-disposition'] || '';
            const cl = parseInt(headers['content-length'] || '0', 10);

            // Prioritas 1: Content-Disposition
            if (cd && (/attachment/i.test(cd) || /filename=/i.test(cd))) {
                if (!isRealDownloadUrl(url) && !/\.(mp4|mp3|m4a|webm|mov|jpg|png)/i.test(cd)) {
                    return;
                }
                const m = cd.match(/filename\*?=["']?(?:UTF-8'')?([^"';]+)["']?/i);
                promote(url, 'content-disposition', {
                    contentType: ct,
                    size: cl,
                    filename: m ? decodeURIComponent(m[1].trim()) : null,
                });
                return;
            }

            // Prioritas 2: Content-Type video/audio
            if (
                /^(video|audio)\//i.test(ct) &&
                !/\/icons?\//i.test(url) &&
                !/\/logo/i.test(url)
            ) {
                promote(url, 'content-type', { contentType: ct, size: cl });
                return;
            }

            // Prioritas 3: URL pattern
            if (isRealDownloadUrl(url)) {
                promote(url, 'pattern', { contentType: ct, size: cl });
            }
        };

        const downloadListener = (download) => {
            if (!captured.url) {
                promote(download.url(), 'download-event', {
                    filename: download.suggestedFilename(),
                });
            }
            download.cancel().catch(() => {});
        };

        page.on('response', responseListener);
        page.on('download', downloadListener);

        try {
            // 4. Klik tombol download (cek dulu ada & enabled)
            const ok = await page.evaluate(() => {
                const btn = document.querySelector('#res #dl, #res button.go');
                if (!btn || btn.disabled) return false;
                btn.click();
                return true;
            });

            if (!ok) {
                log(`  ⚠️  [${formatIndex}] tombol download tidak ada/disabled`);
                return null;
            }

            // 5. Tunggu capture ATAU timeout — nggak polling manual
            await Promise.race([
                capturePromise,
                new Promise((r) => setTimeout(r, waitTimeout)),
            ]);
        } finally {
            page.off('response', responseListener);
            page.off('download', downloadListener);
        }

        return captured.url ? captured : null;
    }

    /* ── Cloudflare challenge detector ── */
    async detectCloudflareBlock(page) {
        return await page.evaluate(() => {
            const hasChallenge =
                document.querySelector('#cf-challenge-running') ||
                document.querySelector('iframe[src*="challenges.cloudflare.com"]') ||
                document.querySelector('[data-translate="checking_browser"]');
            const title = (document.title || '').toLowerCase();
            return Boolean(
                hasChallenge ||
                title.includes('just a moment') ||
                title.includes('attention required')
            );
        }).catch(() => false);
    }

    /* ========================================================
     *  SCRAPE
     * ======================================================== */

    async scrape(targetUrl, options = {}) {
        const { headless = true, slowMo = 0, dump = false, maxFormats = 0 } = options;

        const startTime = Date.now();
        const log = (...args) => {
            if (dump) process.stderr.write('[OM] ' + args.join(' ') + '\n');
        };

        const browser = await chromium.launch({
            headless,
            slowMo,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled',
            ],
        });

        let page = null;
        const platform = detectPlatform(targetUrl);

        try {
            const ctx = await browser.newContext({
                userAgent: this.ua,
                locale: 'id-ID',
                timezoneId: 'Asia/Jakarta',
                viewport: { width: 1366, height: 900 },
                acceptDownloads: true,
            });

            await ctx.addInitScript(`
                Object.defineProperty(navigator, 'webdriver', { get: () => false });
                Object.defineProperty(navigator, 'languages', { get: () => ['id-ID', 'id', 'en-US', 'en'] });
                Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
                Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
                window.chrome = { runtime: {} };
            `);

            page = await ctx.newPage();

            log('step 1: goto');
            await page.goto(this.siteUrl, {
                waitUntil: 'domcontentloaded',
                timeout: this.navTimeout,
            });

            // Cek CF lebih awal
            if (await this.detectCloudflareBlock(page)) {
                log('cf challenge terdeteksi, tunggu sampai hilang…');
                await page
                    .waitForFunction(
                        () => !document.querySelector('#cf-challenge-running'),
                        { timeout: 20_000, polling: 300 }
                    )
                    .catch(() => {});
            }

            // Tunggu input ada — nggak perlu fixed 2.5s
            await page.waitForSelector('#u', { state: 'attached', timeout: 15_000 });

            // Hide popup (tanpa nunggu)
            await page.evaluate(() => {
                ['#cookies', '.cookie-popup', '.popup-overlay', '.modal-backdrop']
                    .forEach((sel) =>
                        document.querySelectorAll(sel).forEach((el) => {
                            if (el.style) el.style.display = 'none';
                        })
                    );
            });

            log('step 2: fill input');
            const filled = await page.evaluate(
                ({ value }) => {
                    const input = document.querySelector('#u');
                    if (!input) return false;
                    input.style.display = 'block';
                    input.style.visibility = 'visible';
                    input.removeAttribute('disabled');
                    const setter = Object.getOwnPropertyDescriptor(
                        window.HTMLInputElement.prototype,
                        'value'
                    )?.set;
                    if (setter) setter.call(input, value);
                    else input.value = value;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    input.focus();
                    return input.value === value;
                },
                { value: targetUrl }
            );
            if (!filled) throw new Error('Input #u tidak ditemukan');

            log('step 3: submit');
            const submitted = await page.evaluate(() => {
                const btn = document.querySelector('#f button[type="submit"]');
                if (!btn) return false;
                btn.click();
                return true;
            });
            if (!submitted) throw new Error('Tombol submit tidak ditemukan');

            log('step 4: wait #res');
            try {
                await page.waitForSelector('#res .fmt-card', { timeout: 30_000 });
            } catch {
                if (await this.detectCloudflareBlock(page)) {
                    throw new Error('Kena Cloudflare challenge, gagal lanjut');
                }
                throw new Error('Result section tidak muncul (timeout)');
            }

            log('step 5: parse #res');
            const resultData = await this.parseResultSection(page);
            if (!resultData) throw new Error('Result section tidak ditemukan');

            // ── Loop capture per format ──
            const total = resultData.formats.length;
            const limit = maxFormats > 0 ? Math.min(maxFormats, total) : total;

            log(`ditemukan ${total} format, capture ${limit} format`);

            const formats = [];
            for (let i = 0; i < limit; i++) {
                const f = resultData.formats[i];
                log(`format ${i + 1}/${limit}: ${f.title || 'untitled'}`);

                const captured = await this.captureUrlForFormat(page, i, { log });
                const type = detectFormatType(f.title, f.meta);

                formats.push({
                    index: f.index,
                    title: f.title,
                    meta: f.meta,
                    sizeRaw: f.size,
                    size: parseSize(f.size),
                    duration: parseDuration(f.formatDuration),
                    type,
                    category: detectCategory(type),
                    quality: detectQuality(f.title) || detectQuality(f.meta),
                    active: f.active,
                    downloadUrl: captured?.url || null,
                    downloadFilename: captured?.filename || null,
                    downloadContentType: captured?.contentType || null,
                    downloadSize: captured?.size || null,
                    downloadSource: captured?.source || null,
                    captured: Boolean(captured?.url),
                });
            }

            // Format yang di-skip (kalau --max < total)
            for (let i = limit; i < total; i++) {
                const f = resultData.formats[i];
                const type = detectFormatType(f.title, f.meta);
                formats.push({
                    index: f.index,
                    title: f.title,
                    meta: f.meta,
                    sizeRaw: f.size,
                    size: parseSize(f.size),
                    duration: parseDuration(f.formatDuration),
                    type,
                    category: detectCategory(type),
                    quality: detectQuality(f.title) || detectQuality(f.meta),
                    active: f.active,
                    downloadUrl: null,
                    captured: false,
                    skipped: true,
                });
            }

            const capturedCount = formats.filter((f) => f.captured).length;

            return {
                ok: true,
                platform,
                sourceUrl: targetUrl,
                scrapedAt: new Date().toISOString(),
                durationMs: Date.now() - startTime,
                meta: {
                    title: resultData.title,
                    author: resultData.author,
                    thumbnail: resultData.thumbnail,
                    duration: parseDuration(resultData.duration),
                    music: resultData.music,
                    stats: resultData.stats,
                    tabs: resultData.tabs,
                    tokens: resultData.tokens,
                },
                formats,
                summary: {
                    totalFormats: formats.length,
                    captured: capturedCount,
                    failed: formats.length - capturedCount,
                },
            };
        } finally {
            if (page) await page.close().catch(() => {});
            await browser.close().catch(() => {});
        }
    }
}

/* ============================================================
 *  CLI
 * ============================================================ */

function parseArgs(args) {
    const flags = {
        headless: true,
        slowMo: 0,
        dump: false,
        maxFormats: 0,
    };
    let target = null;

    for (const a of args) {
        if (a === '--headed') flags.headless = false;
        else if (a === '--slow') flags.slowMo = 300;
        else if (a === '--dump') flags.dump = true;
        else if (a === '--help' || a === '-h') {
            printHelp();
            exit(0);
        } else if (a.startsWith('--max=')) {
            flags.maxFormats = parseInt(a.split('=')[1], 10) || 0;
        } else if (!a.startsWith('--') && !target) {
            target = a;
        }
    }

    return { target, flags };
}

function printHelp() {
    process.stdout.write(
        `Usage: node omdown.mjs <link> [options]\n\n` +
        `Options:\n` +
        `  --headed      Tampilkan browser\n` +
        `  --slow        Slow-motion 300ms\n` +
        `  --dump        Log verbose ke stderr\n` +
        `  --max=N       Max format yang di-capture (default 0 = semua)\n` +
        `  --help        Bantuan\n`
    );
}

async function main() {
    const { target, flags } = parseArgs(argv.slice(2));

    if (!target) {
        printHelp();
        exit(1);
    }

    const scraper = new OMDownload();

    try {
        const result = await scraper.scrape(target, flags);
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
        exit(0);
    } catch (err) {
        process.stderr.write(`[OM] ERROR: ${err.message}\n`);
        if (flags.dump && err.stack) process.stderr.write(err.stack + '\n');
        exit(2);
    }
}

main();
