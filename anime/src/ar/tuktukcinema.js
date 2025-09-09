const mangayomiSources = [{
    "name": "Tuktukcinema",
    "id": 645839201,
    "baseUrl": "https://tuk.cam",
    "lang": "ar",
    "typeSource": "single",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=https://tuk.cam",
    "itemType": 1,
    "version": "1.0.1",
    "pkgPath": "anime/src/ar/tuktukcinema.js",
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
        this.source.baseUrl = this.source.baseUrl.trim();
    }

    // --- PREFERENCES AND HEADERS ---
    getPreference(key) {
        return new SharedPreferences().get(key);
    }
    getBaseUrl() {
        return this.source.baseUrl;
    }
    getHeaders(url) {
        return {
            "Referer": this.getBaseUrl() + "/",
            "Origin": this.getBaseUrl(),
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:138.0) Gecko/20101001 Firefox/138.0"
        };
    }
    _getVideoHeaders(refererUrl) {
        const headers = this.getHeaders(refererUrl);
        headers["Referer"] = refererUrl;
        try {
            const url = new URL(refererUrl);
            headers["Origin"] = url.origin;
        } catch (e) {
            headers["Origin"] = this.getBaseUrl();
        }
        return headers;
    }

    // --- TITLE NORMALIZATION ---
    _titleEdit(title) {
        let e = title ? title.trim() : ""; if (!e) return e;
        const t = { "الاول": "1", "الثاني": "2", "الثالث": "3", "الرابع": "4", "الخامس": "5", "السادس": "6", "السابع": "7", "الثامن": "8", "التاسع": "9", "العاشر": "10", "الحادي عشر": "11", "الثاني عشر": "12" };
        e = e.replace(/[\u2013\u2014\u2015\u2212]/g, "-").replace(/\s*\(.*?\)\s*/g, " ").replace(/\s*\[.*?\]\s*/g, " ");
        let r = ""; e = e.replace(/\b(\d{4})\b/, ((e, t) => (r = t, "")));
        e = e.replace(/^(?:فيلم|عرض|مسلسل|برنامج|انمي)\s+/i, "");
        Object.keys(t).forEach((r => { const i = new RegExp(`الموسم\\s*(?:ال)*${r}\\b`, "gi"); e = e.replace(i, `الموسم ${t[r]}`) }));
        e = e.replace(/الموسم\s*(\d+)/gi, "s$1").replace(/الحلقة\s*(\d+)/gi, "E$1");
        e = e.replace(/\s+(?:مترجم|مترجمة|مدبلج|مدبلجة|اون لاين|اونلاين|كامل|بجودة|جودة|عالية|حصريا|مشاهدة)\s*$/gi, "");
        e = e.replace(/\b(?:HD|4K|FHD|UHD|HDRip|BluRay|WEB-DL|720p|1080p)\b/gi, "").replace(/\s+/g, " ");
        if (r) { e += ` (${r})`; } return e.trim();
    }
    
    // --- BROWSE/SEARCH METHODS ---
    async requestDoc(path) {
        const url = this.source.baseUrl + path;
        const res = await this.client.get(url, this.getHeaders(url));
        return new Document(res.body);
    }
    
    async _parseCataloguePage(doc, isSearch = false) {
        const list = [];
        doc.select("div.Block--Item, div.Small--Box").forEach(item => {
            const linkElement = item.selectFirst("a"); if (!linkElement) return;
            const name = this._titleEdit(linkElement.attr("title"));
            const imageUrl = item.selectFirst("img")?.attr(isSearch ? "src" : "data-src");
            list.push({ name, imageUrl, link: linkElement.getHref });
        });
        return { list, hasNextPage: !!doc.selectFirst("div.pagination ul.page-numbers li a.next") };
    }

    async getPopular(page) {
        return await this._parseCataloguePage(await this.requestDoc(`/category/movies/?page=${page}`));
    }

    async getLatestUpdates(page) {
        return await this._parseCataloguePage(await this.requestDoc(`/recent/page=${page}/`));
    }

    async search(query, page, filters) {
        let path;
        if (query) { path = `/?s=${encodeURIComponent(query)}&page=${page}`; } 
        else { const selectedCategory = filters[0].values[filters[0].state].value;
            if (selectedCategory) { path = `/${selectedCategory}?page=${page}/`; } 
            else { return this.getPopular(page); }
        }
        return await this._parseCataloguePage(await this.requestDoc(path), !!query);
    }

    async getDetail(url) {
        const doc = await this.requestDoc(url.replace(this.source.baseUrl, ''));
        const name = this._titleEdit(doc.selectFirst("h1.post-title")?.text);
        const imageUrl = doc.selectFirst("div.left div.image img")?.getSrc;
        const description = doc.selectFirst("div.story")?.text.trim();
        const genre = doc.select("div.catssection li a").map(e => e.text);
        const chapters = [];
        const episodeElements = doc.select("section.allepcont div.row a");
        if (episodeElements.length > 0) {
            const sortedEpisodes = [...episodeElements].sort((a, b) => (parseInt(a.selectFirst("div.epnum")?.text.replace(/\D/g, '') || '0') - parseInt(b.selectFirst("div.epnum")?.text.replace(/\D/g, '') || '0')));
            sortedEpisodes.forEach(ep => chapters.push({ name: this._titleEdit(ep.attr("title")), url: ep.getHref }));
        } else { chapters.push({ name: "مشاهدة", url: url }); }
        return { name, imageUrl, description, genre, status: 1, chapters, link: url };
    }

    // --- VIDEO EXTRACTION CONTROLLER ---
    async getVideoList(url) {
        const allStreams = [];
        const fetchMode = this.getPreference("link_fetch_mode") || "both";
        if (fetchMode === "watch" || fetchMode === "both") allStreams.push(...await this._getWatchLinks(url));
        if (fetchMode === "download" || fetchMode === "both") allStreams.push(...await this._getDownloadLinks(url));
        const uniqueStreams = Array.from(new Map(allStreams.map(item => [item.url, item])).values());
        const preferredQuality = this.getPreference("preferred_quality") || "720";
        uniqueStreams.sort((a, b) => ((a.quality.includes(preferredQuality) ? 1 : 0) > (b.quality.includes(preferredQuality) ? 1 : 0) ? -1 : 1));
        return uniqueStreams;
    }

    async _getWatchLinks(url) {
        const videos = [];
        const watchUrl = url.endsWith('/') ? `${url}watch/` : `${url}/watch/`;
        try {
            const doc = await this.requestDoc(watchUrl.replace(this.getBaseUrl(), ''));
            for (const serverEl of doc.select("div.watch--servers--list ul li.server--item")) {
                await this._processLink(videos, serverEl.attr("data-link"), serverEl.text.trim());
            }
        } catch (e) {}
        return videos;
    }

    async _getDownloadLinks(url) {
        const videos = [];
        const watchUrl = url.endsWith('/') ? `${url}watch/` : `${url}/watch/`;
        try {
            const doc = await this.requestDoc(watchUrl.replace(this.getBaseUrl(), ''));
            for (const downloadEl of doc.select("div.downloads a.download--item")) {
                await this._processLink(videos, downloadEl.getHref, `[DL] ${downloadEl.selectFirst("span")?.text.trim()}`);
            }
        } catch (e) {}
        return videos;
    }

    async _processLink(videoList, url, prefix) {
        if (!url) return;
        const hosterSelection = this.getPreference("hoster_selection") || [];
        try {
            let foundVideos = false;
            const extractor = this.extractorMap.find(ext => hosterSelection.includes(ext.key) && ext.domains.some(d => url.includes(d)));
            if (extractor) {
                const extracted = await extractor.func.call(this, url, prefix);
                if (extracted.length > 0) { videoList.push(...extracted); foundVideos = true; }
            }
            if (!foundVideos && this.getPreference("use_fallback_extractor")) {
                const fallbackVideos = await this._allinoneExtractor(url, `[Fallback] ${prefix}`);
                if (fallbackVideos.length > 0) { videoList.push(...fallbackVideos); foundVideos = true; }
            }
            if (!foundVideos && hosterSelection.includes('other') && !prefix.startsWith('[DL]')) {
                let quality = `[Embed] ${prefix}`;
                if (this.getPreference("show_embed_url_in_quality")) { quality += ` [${url}]`; }
                videoList.push({ url: url, originalUrl: url, quality: quality });
            }
        } catch (e) {
             if (this.getPreference("show_embed_url_in_quality")) {
                videoList.push({ url: "", originalUrl: url, quality: `[Debug Fail] ${prefix} [${url}]` });
            }
        }
    }

    // --- PRIMARY EXTRACTORS (User-selectable) ---
    extractorMap = [
        { key: 'cybervynx', domains: ['cybervynx.com', 'smoothpre.com'], func: this._cybervynxExtractor },
        { key: 'dood', domains: ["doodstream.", "dood.", "ds2play.", "doods.", "ds2video.", "d0o0d.", "do0od.", "d0000d.", "d000d.", "dooodster.", "vidply."], func: this._doodstreamExtractor },
        { key: 'mixdrop', domains: ["mixdrop.", "mixdrp.", "mdy48tn97.", "md3b0j6hj.", "mdbekjwqa.", "mdfx9dc8n.", "mixdropjmk.", "mdzsmutpcvykb.", "mxdrop."], func: this._mixdropExtractor },
    ];
    
    _formatQuality(prefix, url, qualitySuffix = "") {
        let quality = `${prefix} ${qualitySuffix}`.trim();
        if (this.getPreference("show_video_url_in_quality")) { quality += ` - ${url}`; }
        return quality;
    }

    async _parseM3U8(playlistUrl, prefix, headers = {}) {
        const fallback = [{ url: playlistUrl, originalUrl: playlistUrl, quality: this._formatQuality(prefix, playlistUrl, "Auto HLS"), headers }];
        if (!this.getPreference("extract_m3u8_qualities", true)) return fallback;
        try {
            const masterPlaylistContent = (await this.client.get(playlistUrl, { headers })).body;
            const regex = /#EXT-X-STREAM-INF:.*(?:RESOLUTION=(\d+x\d+)|BANDWIDTH=(\d+)).*\n(?!#)(.+)/g;
            let match; const parsedQualities = [];
            const baseUrl = playlistUrl.substring(0, playlistUrl.lastIndexOf('/') + 1);
            while ((match = regex.exec(masterPlaylistContent)) !== null) {
                const resolution = match[1]; const bandwidth = match[2];
                let qualityName = resolution ? resolution.split('x')[1] + 'p' : `${Math.round(parseInt(bandwidth) / 1000)}kbps`;
                let streamUrl = match[3].trim();
                if (!streamUrl.startsWith('http')) { streamUrl = baseUrl + streamUrl; }
                parsedQualities.push({ url: streamUrl, originalUrl: playlistUrl, quality: this._formatQuality(prefix, streamUrl, qualityName), headers });
            }
            if (parsedQualities.length > 0) return [ ...fallback, ...parsedQualities ];
            return fallback;
        } catch (e) { return fallback; }
    }

    async _cybervynxExtractor(url, prefix) {
        try {
            const res = await this.client.get(url, this._getVideoHeaders(url));
            const scriptData = res.body.match(/eval\(function\(p,a,c,k,e,d\).*\)/s)?.[0];
            if (!scriptData) return []; const unpacked = unpackJs(scriptData);
            if (!unpacked) return []; const masterUrl = unpacked.match(/file:"([^"]+\.m3u8)"/)?.[1];
            return masterUrl ? await this._parseM3U8(masterUrl, prefix, this._getVideoHeaders(url)) : [];
        } catch (e) { return []; }
    }

    async _doodstreamExtractor(url, prefix) {
        try {
            const videoId = url.split('/').pop(); if (!videoId) return [];
            const downloadPageUrl = `https://d-s.io/d/${videoId}`;
            const res1 = await this.client.get(downloadPageUrl, this._getVideoHeaders(url));
            const doc1 = new Document(res1.body);
            const secondLinkPath = doc1.selectFirst(".download-content a[href*='/download/']")?.attr("href"); if (!secondLinkPath) return [];
            const secondUrl = `https://d-s.io${secondLinkPath}`;
            const res2 = await this.client.get(secondUrl, this._getVideoHeaders(downloadPageUrl));
            const doc2 = new Document(res2.body);
            const finalVideoUrl = doc2.selectFirst(".download-generated a.btn")?.attr("href"); if (!finalVideoUrl) return [];
            return [{ url: finalVideoUrl, quality: this._formatQuality(prefix, finalVideoUrl), originalUrl: finalVideoUrl, headers: this._getVideoHeaders(url) }];
        } catch (e) { return []; }
    }

    async _mixdropExtractor(url, prefix) {
        try {
            let embedUrl = url.includes("/e/") ? url : `https://${new URL(url).hostname}/e/${url.split('/').pop()}`;
            const res = await this.client.get(embedUrl, this._getVideoHeaders(embedUrl)); let html = res.body;
            if (html.includes('(p,a,c,k,e,d)')) { html = unpackJs(html.match(/eval\(function\(p,a,c,k,e,d\).*\)/s)?.[0] || "") || html; }
            const surlMatch = html.match(/(?:vsr|wurl|surl)[^=]*=\s*"([^"]+)/);
            if (surlMatch) {
                let surl = surlMatch[1].startsWith('//') ? 'https:' + surlMatch[1] : surlMatch[1];
                return [{ url: surl, originalUrl: embedUrl, quality: this._formatQuality(prefix, surl), headers: this._getVideoHeaders(embedUrl) }];
            } return [];
        } catch (e) { return []; }
    }

    // --- UNIFIED FALLBACK EXTRACTOR ---
    async _allinoneExtractor(url, prefix) {
        const extractorRouter = [
            { domains: ["vidguard.to", "mivalyo.com", "listeamed.net"], func: async (url, prefix) => {
                const transformedUrl = url.replace(/vidguard\.to|mivalyo\.com/g, "listeamed.net");
                const res = await this.client.get(transformedUrl, this._getVideoHeaders(transformedUrl));
                const scriptBody = res.body.substringAfter("eval(function(p,a,c,k,e,d)").substringBefore("</script>");
                if (!scriptBody) return []; const unpacked = unpackJs("eval(function(p,a,c,k,e,d)" + scriptBody);
                const playlistUrl = unpacked.match(/stream:"([^"]+)"/)?.[1]; if (!playlistUrl) return [];
                const encoded = playlistUrl.match(/sig=([^&]+)/)?.[1]; if (!encoded) return [];
                const charCodes = []; for (let i = 0; i < encoded.length; i += 2) { charCodes.push(parseInt(encoded.slice(i, i + 2), 16) ^ 2); }
                const decodedB64String = String.fromCharCode(...charCodes);
                const rawByteString = atob(decodedB64String); let byteArray = new Uint8Array(rawByteString.length);
                for (let i = 0; i < rawByteString.length; i++) { byteArray[i] = rawByteString.charCodeAt(i); }
                let decoded = byteArray.slice(5, -5).reverse();
                const swapLimit = decoded.length - (decoded.length % 2);
                for (let i = 0; i < swapLimit; i += 2) { [decoded[i], decoded[i+1]] = [decoded[i+1], decoded[i]]; }
                const finalDecodedSig = new TextDecoder().decode(decoded);
                const finalUrl = playlistUrl.replace(encoded, finalDecodedSig);
                return await this._parseM3U8(finalUrl, prefix, this._getVideoHeaders(transformedUrl));
            }},
            { domains: ["mp4upload.com"], func: async (url, prefix) => {
                const embedHtml = (await this.client.get(url, this._getVideoHeaders(url))).body;
                const sourceMatch = embedHtml.match(/player\.src\({[^}]+src:\s*"([^"]+)"/);
                return sourceMatch ? [{ url: sourceMatch[1], originalUrl: sourceMatch[1], quality: this._formatQuality(prefix, sourceMatch[1]), headers: { "Referer": url } }] : [];
            }},
            { domains: ["voe.sx"], func: async (url, prefix) => {
                try {
                    const videoId = url.split('/').pop(); if (!videoId) throw new Error();
                    const res = await this.client.get(`https://kellywhatcould.com/${videoId}/download`, this._getVideoHeaders(url));
                    const doc = new Document(res.body); const videos = [];
                    for (const link of doc.select("a:has(small:contains(Direct Download Link))")) {
                        let videoUrl = link.attr("href")?.replace(/&amp;/g, '&'); if (!videoUrl) continue;
                        videos.push({ url: videoUrl, originalUrl: videoUrl, quality: this._formatQuality(prefix, videoUrl), headers: this._getVideoHeaders(url) });
                    } if (videos.length > 0) return videos;
                } catch (e) {}
                const res = await this.client.get(url, this._getVideoHeaders(url));
                const hlsUrl = res.body.substringAfter("'hls': '").substringBefore("'");
                return hlsUrl ? this._parseM3U8(hlsUrl, prefix) : [];
            }},
            { domains: ["ok.ru"], func: async (url, prefix) => {
                const res = await this.client.get(url.replace('/video/', '/videoembed/'), this.getHeaders(url));
                const dataOptions = res.body.substringAfter("data-options=\"").substringBefore("\""); if (!dataOptions) return [];
                const videoHeaders = this._getVideoHeaders("https://ok.ru/"); videoHeaders["Origin"] = "https://ok.ru";
                const json = JSON.parse(dataOptions.replace(/&quot;/g, '"'));
                const metadata = JSON.parse(json.flashvars.metadata);
                const getQualityName = (name) => ({ "full": "1080p", "hd": "720p", "sd": "480p", "low": "360p", "lowest": "240p", "mobile": "144p" }[name] || name);
                return metadata.videos.map(v => ({ url: v.url, originalUrl: v.url, quality: this._formatQuality(`${prefix} ${getQualityName(v.name)}`, v.url), headers: videoHeaders }));
            }},
            { domains: ["vidmoly.to"], func: async (url, prefix) => {
                const res = await this.client.get(url, this._getVideoHeaders(url));
                const hlsUrl = res.body.substringAfter('file:"').substringBefore('"');
                return (hlsUrl && hlsUrl.includes(".m3u8")) ? this._parseM3U8(hlsUrl, prefix, this._getVideoHeaders(url)) : [];
            }},
            { domains: ["uqload."], func: async (url, prefix) => {
                const res = await this.client.get(url, this.getHeaders(url));
                const videoUrl = res.body.substringAfter('sources: ["').substringBefore('"]');
                return videoUrl.startsWith("http") ? [{ url: videoUrl, quality: this._formatQuality(prefix, videoUrl), originalUrl: videoUrl, headers: this._getVideoHeaders("https://uqload.to/") }] : [];
            }},
            { domains: ["vk.com"], func: async (url, prefix) => {
                const res = await this.client.get(url, this._getVideoHeaders(url));
                return [...res.body.matchAll(/"url(\d+)":"(.*?)"/g)].map(m => ({ url: m[2].replace(/\\/g, ''), originalUrl: m[2].replace(/\\/g, ''), quality: this._formatQuality(`${prefix} ${m[1]}p`, m[2].replace(/\\/g, '')), headers: this._getVideoHeaders(url) }));
            }},
            { domains: ["videa.hu"], func: async (url, prefix) => {
                const res = await this.client.get(url, this.getHeaders(url));
                const videoUrl = res.body.substringAfter("v.player.source(").substringBefore(");").match(/'(https?:\/\/[^']+)'/)?.[1];
                return videoUrl ? [{ url: videoUrl, originalUrl: videoUrl, quality: this._formatQuality(prefix, videoUrl), headers: this._getVideoHeaders(url) }] : [];
            }},
            { domains: ["dailymotion.com"], func: async (url, prefix) => {
                const pageRes = await this.client.get(url, this._getVideoHeaders(url));
                const videoId = pageRes.body.match(/<link rel="canonical" href="[^"]+\/video\/([^"]+)"/)?.[1]; if (!videoId) return [];
                const metadataRes = await this.client.get(`https://www.dailymotion.com/player/metadata/video/${videoId}`, this._getVideoHeaders(url));
                const masterUrl = JSON.parse(metadataRes.body)?.qualities?.auto?.[0]?.url;
                return (masterUrl && masterUrl.includes(".m3u8")) ? this._parseM3U8(masterUrl, prefix, this._getVideoHeaders(url)) : [];
            }},
            { domains: ["sendvid.com"], func: async (url, prefix) => {
                const res = await this.client.get(url, this._getVideoHeaders(url));
                const videoUrl = new Document(res.body).selectFirst("source#source-video")?.getSrc;
                return videoUrl ? [{ url: videoUrl, originalUrl: videoUrl, quality: this._formatQuality(prefix, videoUrl), headers: this._getVideoHeaders(url) }] : [];
            }},
            { domains: ["streamtape.com"], func: async (url, prefix) => {
                const res = await this.client.get(url, this.getHeaders(url));
                const script = res.body.substringAfter("document.getElementById('robotlink')").substringBefore("</script>"); if (!script) return [];
                const finalUrl = "https:" + script.substringAfter("innerHTML = '").substringBefore("'") + script.substringAfter("+ ('xcd").substringBefore("'");
                return [{ url: finalUrl, quality: this._formatQuality(prefix, finalUrl), originalUrl: finalUrl, headers: this._getVideoHeaders(url) }];
            }},
            { domains: ["streamwish.", "vidhide.", "filelions."], func: async (url, prefix) => {
                const res = await this.client.get(url, this.getHeaders(url)); let script = res.body.substringAfter("eval(function(p,a,c,k,e,d)").substringBefore("</script>");
                if (!script) return []; const unpacked = unpackJs("eval(function(p,a,c,k,e,d)" + script);
                const masterUrl = unpacked.match(/(https?:\/\/[^"]+\.m3u8[^"]*)/)?.[1]; if (!masterUrl) return [];
                return this._parseM3U8(masterUrl, prefix, this._getVideoHeaders(url));
            }},
            { domains: ["filemoon.sx"], func: async (url, prefix) => {
                const res1 = await this.client.get(url, this._getVideoHeaders(url)); const iframeUrl = new Document(res1.body).selectFirst("iframe[src]")?.getSrc; if (!iframeUrl) return [];
                const res2 = await this.client.get(iframeUrl, this._getVideoHeaders(url)); let script = res2.body.substringAfter("eval(function(p,a,c,k,e,d)").substringBefore("</script>");
                if (!script) return []; const unpacked = unpackJs("eval(function(p,a,c,k,e,d)" + script);
                const masterUrl = unpacked.match(/(https?:\/\/[^"]+\.m3u8[^"]*)/)?.[1]; if (!masterUrl) return [];
                return this._parseM3U8(masterUrl, prefix, this._getVideoHeaders(iframeUrl));
            }},
            { domains: ["vidbom.com"], func: async (url, prefix) => {
                const res = await this.client.get(url, this.getHeaders(url)); const script = res.body.substringAfter("sources: [").substringBefore("]"); if (!script) return [];
                const videoHeaders = this._getVideoHeaders(url); const sources = script.split('{file:"').slice(1); let allVideos = [];
                for (const source of sources) {
                    const src = source.substringBefore('"');
                    if (src.includes(".m3u8")) { allVideos.push(...await this._parseM3U8(src, prefix, videoHeaders)); } 
                    else { allVideos.push({ url: src, originalUrl: src, quality: this._formatQuality(`${prefix}: ` + source.substringAfter('label:"').substringBefore('"'), src), headers: videoHeaders }); }
                } return allVideos;
            }},
            { domains: ["luluvdo.com"], func: async (url, prefix) => {
                const res = await this.client.get(url, this.getHeaders(url));
                const masterUrl = res.body.substringAfter('jwplayer("vplayer").setup({').substringBefore('});').match(/file:"([^"]+)"/)?.[1];
                return masterUrl ? this._parseM3U8(masterUrl, prefix, this._getVideoHeaders(url)) : [];
            }},
            { domains: ["streamruby.com"], func: async (url, prefix) => {
                const res = await this.client.get(url, this.getHeaders(url)); const script = res.body.substringAfter("sources: [").substringBefore("]");
                const urls = (script.match(/file:"([^"]+)"/g) || []).map(m => m.replace('file:"', '').replace('"', '')); let allVideos = [];
                for (const hlsUrl of urls) { if (hlsUrl.includes(".m3u8")) allVideos.push(...await this._parseM3U8(hlsUrl, prefix, this._getVideoHeaders(url))); }
                return allVideos;
            }},
            { domains: ["upstream.to"], func: async (url, prefix) => {
                const res = await this.client.get(url, this.getHeaders(url)); const script = res.body.substringAfter("eval(function(p,a,c,k,e,d)").substringBefore("</script>"); if (!script) return [];
                const unpacked = unpackJs(script); const masterUrl = unpacked.match(/hls:\s*['"](https?:\/\/[^'"]+\.m3u8[^'"]*)['"]/)?.[1];
                return masterUrl ? this._parseM3U8(masterUrl, prefix, this._getVideoHeaders(url)) : [];
            }},
            { domains: ["krakenfiles.com"], func: async (url, prefix) => {
                const res = await this.client.get(url, this.getHeaders(url));
                const videoUrl = new Document(res.body).selectFirst("source[src]")?.getSrc;
                return videoUrl ? [{ url: videoUrl, originalUrl: videoUrl, quality: this._formatQuality(prefix, videoUrl), headers: this._getVideoHeaders(url) }] : [];
            }},
            { domains: ["thetube.to"], func: async (url, prefix) => {
                let embedUrl = url.includes("/e/") ? url.replace("/e/", "/embed-") + ".html" : url;
                const res = await this.client.get(embedUrl, this.getHeaders(embedUrl)); const script = res.body.substringAfter("eval(function(p,a,c,k,e,d)").substringBefore("</script>");
                if (!script) return []; const unpacked = unpackJs("eval(function(p,a,c,k,e,d)" + script);
                const masterUrl = unpacked.match(/file:\s*['"](https?:\/\/[^'"]+\.m3u8[^'"]*)['"]/)?.[1];
                return masterUrl ? this._parseM3U8(masterUrl, prefix, this._getVideoHeaders(embedUrl)) : [];
            }},
            { domains: ["bigwarp.org"], func: async (url, prefix) => {
                const res = await this.client.get(url, this._getVideoHeaders(url));
                const jwplayerSetup = res.body.substringAfter('jwplayer("vplayer").setup({').substringBefore('});');
                return [...jwplayerSetup.matchAll(/{file:"([^"]+)",label:"([^"]+)"}/g)].map(m => ({ url: m[1], originalUrl: m[1], quality: this._formatQuality(`${prefix} - ${m[2].split(' ')[0]}`, m[1]), headers: this._getVideoHeaders(url) }));
            }},
        ];
        
        try {
            const specificExtractor = extractorRouter.find(ext => ext.domains.some(d => url.includes(d)));
            if (specificExtractor) {
                return await specificExtractor.func.call(this, url, prefix);
            }
    
            // Generic Fallback Logic (original _allinoneExtractor)
            const res = await this.client.get(url, this._getVideoHeaders(url));
            const body = res.body; const videoHeaders = this._getVideoHeaders(url); let sources = [];
            const directVideoSrc = new Document(body).selectFirst("source[src]")?.getSrc || new Document(body).selectFirst("video[src]")?.getSrc;
            if (directVideoSrc) sources.push(directVideoSrc); let potentialScripts = body;
            const packedScriptMatch = body.match(/eval\(function\(p,a,c,k,e,d\)\s?{.*}\)/);
            if (packedScriptMatch) { try { potentialScripts += "\n" + unpackJs(packedScriptMatch[0]); } catch (e) {} }
            const urlRegex = /(https?:\/\/[^"' \s]+\.(?:m3u8|mp4|webm|mkv|mov|flv|avi))[^"' \s]*/ig;
            let match; while ((match = urlRegex.exec(potentialScripts)) !== null) { sources.push(match[0]); }
            const uniqueSources = [...new Set(sources.filter(s => s && s.startsWith("http")))]; const allVideos = [];
            for (const sourceUrl of uniqueSources) {
                if (sourceUrl.includes(".m3u8")) allVideos.push(...await this._parseM3U8(sourceUrl, prefix, videoHeaders));
                else allVideos.push({ url: sourceUrl, originalUrl: sourceUrl, quality: this._formatQuality(prefix, sourceUrl, "Direct"), headers: videoHeaders });
            } return allVideos;
        } catch (e) { return []; }
    }


    // --- FILTERS AND PREFERENCES ---
    getFilterList() {
        const categories = [{"name": "اختر","query": ""}, {"name": "كل الافلام","query": "category/movies-33/"}, {"name": "افلام اجنبى","query": "category/movies-33/افلام-اجنبي/"}, {"name": "افلام انمى","query": "category/anime-6/افلام-انمي/"}, {"name": "افلام تركيه","query": "category/movies-33/افلام-تركي/"}, {"name": "افلام اسيويه","query": "category/movies-33/افلام-اسيوي/"}, {"name": "افلام هنديه","query": "category/movies-33/افلام-هندى/"}, {"name": "كل المسسلسلات","query": "category/series-9/"}, {"name": "مسلسلات اجنبى","query": "category/series-9/مسلسلات-اجنبي/"}, {"name": "مسلسلات انمى","query": "category/anime-6/انمي-مترجم/"}, {"name": "مسلسلات تركى","query": "category/series-9/مسلسلات-تركي/"}, {"name": "مسلسلات اسيوى","query": "category/series-9/مسلسلات-أسيوي/"}, {"name": "مسلسلات هندى","query": "category/series-9/مسلسلات-هندي/"}];
        return [{ type_name: "SelectFilter", name: "الأقسام", state: 0, values: categories.map(c => ({ type_name: "SelectOption", name: c.name, value: c.query })) }];
    }
    
    getSourcePreferences() {
        return [{
            key: "preferred_quality", listPreference: { title: "الجودة المفضلة", summary: "اختر الجودة التي سيتم اختيارها تلقائيا", valueIndex: 1, entries: ["1080p", "720p", "480p", "360p", "Auto"], entryValues: ["1080", "720", "480", "360", "Auto"], }
        }, {
            key: "link_fetch_mode", listPreference: { title: "طريقة جلب الروابط", summary: "اختر من أي صفحة تريد جلب الروابط", valueIndex: 0, entries: ["مشاهدة وتحميل معاً", "صفحة المشاهدة فقط", "صفحة التحميل فقط"], entryValues: ["both", "watch", "download"] }
        }, {
            key: "hoster_selection", multiSelectListPreference: { title: "اختر السيرفرات", summary: "اختر السيرفرات التي تريد ان تظهر", entries: ["Cybervynx/Smoothpre", "Doodstream", "Mixdrop", "Other Embeds"], entryValues: ["cybervynx", "dood", "mixdrop", "other"], values: ["cybervynx", "dood", "mixdrop"], }
        }, {
            key: "extract_m3u8_qualities", switchPreferenceCompat: { title: "استخراج الجودات من روابط M3U8", summary: "عندما يوفر السيرفر جودات متعددة، سيتم عرضها كلها. قم بتعطيل هذا الخيار لرؤية رابط 'تلقائي' واحد فقط.", value: true, }
        }, {
            key: "show_video_url_in_quality", switchPreferenceCompat: { title: "إظهار رابط الفيديو (للتصحيح)", summary: "عرض رابط الفيديو النهائي بجانب اسم الجودة", value: false, }
        }, {
            key: "show_embed_url_in_quality", switchPreferenceCompat: { title: "إظهار رابط التضمين (للتصحيح)", summary: "عرض رابط التضمين الأولي بجانب اسم الجودة", value: false, }
        }, {
            key: "use_fallback_extractor", switchPreferenceCompat: { title: "استخدام مستخرج احتياطي (تجريبي)", summary: "عندما يفشل مستخرج الفيديو الأساسي، حاول استخدام مستخرج عام وقوي", value: true, }
        }];
    }
}

function unpackJs(packedJS) {
    function unq(s) { s = s || ""; if ((s[0] === '"' || s[0] === "'") && s[s.length - 1] === s[0]) { s = s.slice(1, -1); } s = s.replace(/\\x([0-9A-Fa-f]{2})/g, (m, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\u([0-9A-Fa-f]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\\\/g, '\\').replace(/\\\//g, '/').replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\'/g, "'"); return s; }
    function itob(n, b) { if (n === 0) return "0"; var d = "0123456789abcdefghijklmnopqrstuvwxyz", o = ""; while (n) { o = d[n % b] + o; n = Math.floor(n / b); } return o; }
    try { const re = /eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*d\s*\)\s*\{[\s\S]*?\}\s*\(\s*(['"])([\s\S]*?)\1\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"])([\s\S]*?)\5\.split\(['"]\|['"]\)/i; let match = packedJS.match(re); if (!match) return packedJS; let p = unq(match[1] + match[2] + match[1]), a = +match[3], c = +match[4], k = unq("'" + match[6] + "'").split("|"); if (k.length < c) { for (var i = k.length; i < c; i++) k[i] = ""; } for (i = c - 1; i >= 0; i--) { let t = itob(i, a), r = k[i] || t; p = p.replace(new RegExp('\\b' + t + '\\b', 'g'), r); } return p; } catch (e) { return packedJS; }
}
