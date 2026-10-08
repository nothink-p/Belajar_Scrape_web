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
 *
 * SUPPORT:
 *   YouTube, TikTok, Instagram, Spotify, Facebook, X, Pinterest,
 *   SoundCloud, Vimeo, Dailymotion, Reddit, Twitch, Threads, dll.
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

    // ❌ Exclude semua static asset
    if (/\/icons?\//i.test(u)) return false;
    if (/\/logo/i.test(u)) return false;
    if (/logo\.(svg|png|jpg|jpeg|webp|gif)/i.test(u)) return false;
    if (/favicon/i.test(u)) return false;
    if (/\/_next\/static\//i.test(u)) return false;
    if (/\/assets?\/(img|image|icon|font|css|js)/i.test(u)) return false;
    if (/\/images?\/(brand|icons?|logo|mascot)/i.test(u)) return false;
    if (/mascot/i.test(u)) return false;
    if (/\.(css|js|woff2?|ttf|eot|map)($|\?)/i.test(u)) return false;

    // ✅ Accept hanya kalau:
    // 1. Ada /api/media/download atau /api/download
    if (/\/api\/(media\/)?download/i.test(u)) return true;
    if (/\/api\/media\/file/i.test(u)) return true;
    // 2. Atau ada ekstensi media valid
    if (/\.(mp4|mp3|m4a|webm|mov|mkv|aac|ogg)($|\?)/i.test(u)) return true;
    // 3. Atau ada query param download=1
    if (/[?&]download=1/i.test(u)) return true;
    // 4. Atau path /download/ dengan token
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

            // Stats (bisa 2, 3, atau 4 tergantung platform)
            const stats = {};
            res.querySelectorAll('.stat-item').forEach((item) => {
                const label = item.querySelector('.stat-lbl')?.textContent?.trim();
                const num = item.querySelector('.stat-num')?.textContent?.trim();
                if (label) stats[label] = num;
            });

            // Tabs (kalau ada) — cuma info, tidak dipakai
            const tabs = Array.from(res.querySelectorAll('.fmt-tab-btn')).map(
                (tab) => (tab.textContent || '').trim()
            );

            // Formats
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

    /* ── Capture URL per format ── */
    async captureUrlForFormat(page, formatIndex, options) {
        const log = options.log || (() => {});

        // Klik format card
        const selected = await page.evaluate((idx) => {
            const cards = document.querySelectorAll('#res .fmt-card');
            if (!cards[idx]) return false;
            cards[idx].click();
            return true;
        }, formatIndex);

        if (!selected) return null;
        await page.waitForTimeout(600);

        // Setup capture
        const captured = {
            url: null,
            filename: null,
            size: 0,
            contentType: null,
            source: null,
        };

        const tryCapture = (url, source) => {
            if (captured.url) return;
            if (!isRealDownloadUrl(url)) return;
            captured.url = url;
            captured.source = source;
            log(`  ✅ [${formatIndex}] captured (${source}): ${url.slice(0, 90)}`);
        };

        const requestListener = (req) => {
            tryCapture(req.url(), 'request');
        };

        const responseListener = async (res) => {
            const url = res.url();
            const status = res.status();
            const headers = res.headers();
            const ct = (headers['content-type'] || '').toLowerCase();
            const cd = headers['content-disposition'] || '';

            // Prioritas 1: Content-Disposition (file attachment)
            if (status === 200 && cd && !captured.url) {
                if (!isRealDownloadUrl(url) && !/\.(mp4|mp3|m4a|webm|mov|jpg|png)/i.test(cd)) {
                    return;
                }
                captured.url = url;
                captured.contentType = ct;
                captured.source = 'content-disposition';
                captured.size = parseInt(headers['content-length'] || '0', 10);
                const m = cd.match(/filename\*?=["']?(?:UTF-8'')?([^"';]+)["']?/i);
                if (m) captured.filename = decodeURIComponent(m[1].trim());
                log(`  ✅ [${formatIndex}] captured (content-disposition): ${url.slice(0, 90)}`);
                return;
            }

            // Prioritas 2: Content-Type video/audio (exclude icons)
            if (
                status === 200 &&
                /^(video|audio)\//i.test(ct) &&
                !/\/icons?\//i.test(url) &&
                !/\/logo/i.test(url) &&
                !captured.url
            ) {
                captured.url = url;
                captured.contentType = ct;
                captured.source = 'content-type';
                captured.size = parseInt(headers['content-length'] || '0', 10);
                log(`  ✅ [${formatIndex}] captured (${ct}): ${url.slice(0, 90)}`);
                return;
            }

            // Prioritas 3: URL pattern
            if (status === 200) {
                tryCapture(url, 'pattern');
            }
        };

        const downloadListener = async (download) => {
            const url = download.url();
            if (!captured.url && isRealDownloadUrl(url)) {
                captured.url = url;
                captured.filename = download.suggestedFilename();
                captured.source = 'download-event';
                log(`  ✅ [${formatIndex}] captured (download event): ${url.slice(0, 90)}`);
            }
            try {
                await download.cancel();
            } catch { /* ignore */ }
        };

        page.on('request', requestListener);
        page.on('response', responseListener);
        page.on('download', downloadListener);

        // Klik #dl
        await page.evaluate(() => {
            const btn = document.querySelector('#res #dl, #res button.go');
            if (btn) btn.click();
        });

        // Tunggu capture (maks 8 detik)
        const startWait = Date.now();
        while (!captured.url && Date.now() - startWait < 8000) {
            await page.waitForTimeout(200);
        }

        page.off('request', requestListener);
        page.off('response', responseListener);
        page.off('download', downloadListener);

        return captured.url ? captured : null;
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
                extraHTTPHeaders: {
                    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
                },
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
            await page.waitForTimeout(2500);

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
            await page.waitForTimeout(400);

            log('step 3: submit');
            const clicked = await page.evaluate(() => {
                const btn = document.querySelector('#f button[type="submit"]');
                if (!btn) return false;
                btn.click();
                return true;
            });
            if (!clicked) throw new Error('Tombol submit tidak ditemukan');

            log('step 4: wait #res');
            await page
                .waitForSelector('#res .fmt-card', { timeout: 30_000 })
                .catch(() => {});
            await page.waitForTimeout(2000);

            log('step 5: parse #res');
            const resultData = await this.parseResultSection(page);
            if (!resultData) throw new Error('Result section tidak ditemukan');

            log(`  title  : ${(resultData.title || '').slice(0, 60)}`);
            log(`  author : ${resultData.author}`);
            log(`  formats: ${resultData.formats.length}`);

            /* ── STEP 6: Capture URL per format ── */
            log('step 6: capture URLs per format');
            const formatsWithUrls = [];

            const totalFormats = resultData.formats.length;
            const limit =
                maxFormats > 0 ? Math.min(maxFormats, totalFormats) : totalFormats;

            if (totalFormats === 0) {
                const captured = await this.captureUrlForFormat(page, 0, { log });
                if (captured) {
                    formatsWithUrls.push({
                        index: 0,
                        title: null,
                        meta: null,
                        type: 'unknown',
                        category: 'other',
                        size_text: null,
                        size_bytes: null,
                        size_human: null,
                        quality: null,
                        duration: null,
                        active: true,
                        download_url: captured.url,
                        filename: captured.filename,
                        content_type: captured.contentType,
                        capture_source: captured.source,
                    });
                }
            } else {
                for (let i = 0; i < limit; i++) {
                    const fmt = resultData.formats[i];
                    log(`  → format[${i}]: ${fmt.title}`);

                    const captured = await this.captureUrlForFormat(page, i, {
                        log,
                    });

                    const sizeInfo = parseSize(fmt.size);
                    const quality = detectQuality(`${fmt.title} ${fmt.meta}`);
                    const type = detectFormatType(fmt.title, fmt.meta);
                    const category = detectCategory(type);
                    const durationFromFormat = fmt.formatDuration
                        ? parseDuration(fmt.formatDuration)
                        : null;

                    formatsWithUrls.push({
                        index: i,
                        title: fmt.title,
                        meta: fmt.meta,
                        type,
                        category,
                        size_text: fmt.size,
                        size_bytes: sizeInfo ? sizeInfo.bytes : null,
                        size_human: sizeInfo
                            ? `${sizeInfo.value} ${sizeInfo.unit}`
                            : null,
                        quality,
                        duration: durationFromFormat,
                        active: fmt.active,
                        download_url: captured ? captured.url : null,
                        filename: captured ? captured.filename : null,
                        content_type: captured ? captured.contentType : null,
                        capture_source: captured ? captured.source : null,
                    });

                    await page.waitForTimeout(300);
                }
            }

            /* ── STEP 7: Build output ── */
            const durationInfo = parseDuration(resultData.duration);
            const elapsed = parseFloat(((Date.now() - startTime) / 1000).toFixed(2));

            const formatsAvailable = formatsWithUrls.filter((f) => f.download_url);
            const primary =
                formatsWithUrls.find((f) => f.active && f.download_url) ||
                formatsWithUrls.find((f) => f.category === 'video' && f.download_url) ||
                formatsAvailable[0] ||
                null;

            let music = resultData.music;
            if (!music?.title && !music?.text) {
                const musicFormat = formatsWithUrls.find(
                    (f) => f.type === 'audio_music' || f.type === 'audio_spotify'
                );
                if (musicFormat) {
                    music = {
                        title: musicFormat.title,
                        text: musicFormat.title,
                        from: 'format_card',
                    };
                }
            }

            // Group by category
            const grouped = {
                video: formatsWithUrls.filter((f) => f.category === 'video'),
                audio: formatsWithUrls.filter((f) => f.category === 'audio'),
                image: formatsWithUrls.filter((f) => f.category === 'image'),
                other: formatsWithUrls.filter((f) => f.category === 'other'),
            };

            return {
                status: formatsAvailable.length > 0 ? 'success' : 'failed',
                message:
                    formatsAvailable.length > 0
                        ? `Berhasil extract ${formatsAvailable.length}/${formatsWithUrls.length} format`
                        : 'Tidak ada URL download ditemukan',
                data: {
                    platform: platform.name,
                    platform_subtype: platform.subtype,
                    source_url: targetUrl,
                    site_url: this.siteUrl,
                    title: resultData.title,
                    author: resultData.author,
                    thumbnail: resultData.thumbnail,
                    duration: durationInfo,
                    music: music,
                    stats: resultData.stats,
                    tabs: resultData.tabs,
                    formats_count: formatsWithUrls.length,
                    formats_available: formatsAvailable.length,
                    formats: formatsWithUrls,
                    grouped: {
                        video: grouped.video.length,
                        audio: grouped.audio.length,
                        image: grouped.image.length,
                        other: grouped.other.length,
                    },
                    primary_format: primary,
                },
                meta: {
                    elapsed_seconds: elapsed,
                    timestamp: new Date().toISOString(),
                    version: '3.0.0',
                },
            };
        } catch (err) {
            const elapsed = parseFloat(((Date.now() - startTime) / 1000).toFixed(2));
            return {
                status: 'failed',
                message: err.message,
                data: {
                    platform: platform.name,
                    platform_subtype: platform.subtype,
                    source_url: targetUrl,
                    site_url: this.siteUrl,
                    title: null,
                    author: null,
                    thumbnail: null,
                    duration: null,
                    music: null,
                    stats: {},
                    tabs: [],
                    formats_count: 0,
                    formats_available: 0,
                    formats: [],
                    grouped: { video: 0, audio: 0, image: 0, other: 0 },
                    primary_format: null,
                },
                meta: {
                    elapsed_seconds: elapsed,
                    timestamp: new Date().toISOString(),
                    version: '3.0.0',
                },
            };
        } finally {
            if (page && !headless) {
                await page.waitForTimeout(3000).catch(() => {});
            }
            await browser.close().catch(() => {});
        }
    }
}

/* ============================================================
 *  MAIN
 * ============================================================ */

async function main() {
    const args = argv.slice(2);

    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        process.stderr.write(`
OM Download — Universal Scraper v3

Usage:
  node omdown.mjs <link> [options]

Options:
  --headed    Tampilkan browser (default: headless)
  --slow      Slow-motion 300ms (debug)
  --dump      Log verbose ke stderr
  --max=N     Max format yang di-capture URL-nya (default: 0 = semua)
  --help      Bantuan

Support:
  YouTube, TikTok, Instagram, Spotify, Facebook, X, Pinterest,
  SoundCloud, Vimeo, Dailymotion, Reddit, Twitch, Threads, dll.

Examples:
  node omdown.mjs https://youtu.be/xxx
  node omdown.mjs https://www.tiktok.com/@user/video/123
  node omdown.mjs https://open.spotify.com/track/xxx
  node omdown.mjs https://youtu.be/xxx --max=3 --dump
`);
        exit(0);
    }

    const positionalArgs = args.filter((a) => !a.startsWith('--'));
    const link = positionalArgs.join('&');

    const headed = args.includes('--headed');
    const slow = args.includes('--slow');
    const dump = args.includes('--dump');
    const maxArg = args.find((a) => a.startsWith('--max='));
    const maxFormats = maxArg ? parseInt(maxArg.split('=')[1]) || 0 : 0;

    if (!link) {
        console.log(JSON.stringify({ status: 'failed', message: 'Link wajib diisi', data: null }, null, 2));
        exit(1);
    }

    try {
        new URL(link);
    } catch {
        console.log(JSON.stringify({ status: 'failed', message: `Link tidak valid: ${link}`, data: null }, null, 2));
        exit(1);
    }

    const scraper = new OMDownload();

    try {
        const result = await scraper.scrape(link, {
            headless: !headed,
            slowMo: slow ? 300 : 0,
            dump,
            maxFormats,
        });

        console.log(JSON.stringify(result, null, 2));
        exit(result.status === 'success' ? 0 : 1);
    } catch (err) {
        console.log(JSON.stringify({ status: 'failed', message: err.message, data: null }, null, 2));
        exit(1);
    }
}

main();
