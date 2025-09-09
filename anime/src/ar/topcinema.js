const mangayomiSources = [{
    "name": "Topcinema",
    "id": 645835682,
    "baseUrl": "https://web6.topcinema.cam",
    "lang": "ar",
    "typeSource": "single",
    "iconUrl": "https://www.google.com/s2/favicons?sz=128&domain=https://web6.topcinema.cam",
    "itemType": 1,
    "version": "1.0.2",
    "pkgPath": "anime/src/ar/topcinema.js",
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
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:138.0) Gecko/20100101 Firefox/138.0"
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

    // --- BASIC BROWSE/DETAIL METHODS ---
    async requestDoc(path, headers = {}) {
        const url = this.source.baseUrl + path;
        const res = await this.client.get(url, this.getHeaders(url));
        return new Document(res.body);
    }
    _titleEdit(title) {
        let e = title ? title.trim() : "";
        if (!e) return e;
        const t = {
            "الاول": "1",
            "الثاني": "2",
            "الثالث": "3",
            "الرابع": "4",
            "الخامس": "5",
            "السادس": "6",
            "السابع": "7",
            "الثامن": "8",
            "التاسع": "9",
            "العاشر": "10",
            "الحادي عشر": "11",
            "الثاني عشر": "12"
        };
        e = e.replace(/[\u2013\u2014\u2015\u2212]/g, "-"), e = e.replace(/\s*\(.*?\)\s*/g, " ").replace(/\s*\[.*?\]\s*/g, " ");
        let r = "";
        return e = e.replace(/\b(\d{4})\b/, ((e, t) => (r = t, ""))), e = e.replace(/^(?:فيلم|عرض|مسلسل|برنامج|انمي)\s+/i, ""), Object.keys(t).forEach((r => {
            const i = new RegExp(`الموسم\\s*(?:ال)*${r}\\b`, "gi");
            e = e.replace(i, `الموسم ${t[r]}`)
        })), e = e.replace(/الموسم\s*(\d+)/gi, "s$1").replace(/الحلقة\s*(\d+)/gi, "E$1"), e = e.replace(/\s+(?:مترجم|مترجمة|مدبلج|مدبلجة|اون لاين|اونلاين|كامل|بجودة|جودة|عالية|حصريا|مشاهدة)\s*$/gi, ""), e = e.replace(/\b(?:HD|4K|FHD|UHD|HDRip|BluRay|WEB-DL|720p|1080p)\b/gi, ""), e = e.replace(/\s+/g, " "), r && (e += ` (${r}`), e.trim()
    }
    async _processListingItems(doc) {
        const e = [];
        const t = doc.select("div.Block--Item, div.Small--Box");
        for (const r of t) {
            const t = r.selectFirst("a");
            if (t) {
                const i = t.getHref,
                    s = this._titleEdit(t.attr("title") || r.selectFirst("h3.title") ? .text),
                    o = r.selectFirst("img") ? .attr("data-src");
                if (i.includes("/series/")) try {
                    const t = await this.requestDoc(i.replace(this.source.baseUrl, "")),
                        r = t.select("section.allseasonss div.Small--Box.Season");
                    if (r.length > 0)
                        for (const t of r) {
                            const r = t.selectFirst("a");
                            r && e.push({
                                name: this._titleEdit(r.attr("title") || t.selectFirst("h3.title") ? .text),
                                imageUrl: t.selectFirst("img") ? .attr("data-src"),
                                link: r.getHref
                            })
                        } else e.push({
                            name: s,
                            imageUrl: o,
                            link: i
                        })
                } catch (t) {
                    e.push({
                        name: s,
                        imageUrl: o,
                        link: i
                    })
                } else e.push({
                    name: s,
                    imageUrl: o,
                    link: i
                })
            }
        }
        return e
    }
    async getPopular(e) {
        const t = await this.requestDoc(`/movies/page/${e}/`);
        return {
            list: await this._processListingItems(t),
            hasNextPage: !!t.selectFirst("div.pagination a.next")
        }
    }
    async getLatestUpdates(e) {
        const t = await this.requestDoc(`/recent/page/${e}/`);
        return {
            list: await this._processListingItems(t),
            hasNextPage: !!t.selectFirst("div.pagination a.next")
        }
    }
    async search(e, t, r) {
        let i;
        const s = r[0];
        if (e) i = `/search/?query=${encodeURIComponent(e)}&offset=${t-1}`;
        else {
            const e = s.values[s.state].value;
            e ? i = `${e.endsWith("/")?e:e+"/"}page/${t}/` : await this.getPopular(t)
        }
        const o = await this.requestDoc(i);
        return {
            list: await this._processListingItems(o),
            hasNextPage: !!o.selectFirst("div.pagination a.next")
        }
    }
    async getDetail(e) {
        const t = await this.requestDoc(e.replace(this.source.baseUrl, "")),
            r = this._titleEdit(t.selectFirst("h1.post-title") ? .text),
            i = t.selectFirst("div.image img") ? .getSrc,
            s = t.selectFirst("div.story") ? .text.trim(),
            o = t.select("div.catssection li a").map((e => e.text)),
            a = [];
        return t.select("section.allepcont div.row a").forEach((e => {
            a.push({
                name: this._titleEdit(e.attr("title")),
                url: e.getHref
            })
        })), 0 == a.length && a.push({
            name: "مشاهدة",
            url: e
        }), {
            name: r,
            imageUrl: i,
            description: s,
            genre: o,
            status: 1,
            chapters: a,
            link: e
        }
    }

    // --- VIDEO EXTRACTION CONTROLLER ---
    async getVideoList(url) {
        const allStreams = [];
        const fetchMode = this.getPreference("link_fetch_mode") || "both";
        if (fetchMode === "watch" || fetchMode === "both") {
            allStreams.push(...await this._getWatchLinks(url));
        }
        if (fetchMode === "download" || fetchMode === "both") {
            allStreams.push(...await this._getDownloadLinks(url));
        }
        const uniqueStreams = Array.from(new Map(allStreams.map(item => [item.originalUrl, item])).values());
        const preferredQuality = this.getPreference("preferred_quality") || "720";
        uniqueStreams.sort((a, b) => {
            const qualityA = parseInt(a.quality.match(/(\d+)p/) ? .[1] || 0),
                qualityB = parseInt(b.quality.match(/(\d+)p/) ? .[1] || 0);
            return (qualityB + (b.quality.includes(preferredQuality) ? 10000 : 0)) - (qualityA + (a.quality.includes(preferredQuality) ? 10000 : 0));
        });
        return uniqueStreams;
    }

    // --- LINK GATHERING ---
    async _getWatchLinks(url) {
        const videos = [];
        const watchUrl = url.endsWith('/watch/') ? url : (url.endsWith('/') ? `${url}watch/` : `${url}/watch/`);
        try {
            const doc = await this.requestDoc(watchUrl.replace(this.getBaseUrl(), ''));
            const initialIframeSrc = doc.selectFirst("div.player--iframe iframe") ? .getSrc;
            const initialServerName = doc.selectFirst("li.server--item.active span") ? .text.trim() || "Default Server";
            await this._processLink(videos, initialIframeSrc, initialServerName);
            for (const serverEl of doc.select("li.server--item")) {
                let serverName = serverEl.selectFirst("span") ? .text.trim();
                try {
                    const dataId = serverEl.attr("data-id"),
                        dataServer = serverEl.attr("data-server");
                    if (!dataId || !dataServer) continue;
                    const ajaxHeaders = {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:138.0) Gecko/20100101 Firefox/138.0",
                        "Accept": "*/*",
                        "Accept-Language": "en-US,en;q=0.5",
                        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
                        "X-Requested-With": "XMLHttpRequest",
                        "Origin": this.getBaseUrl(),
                        "Referer": watchUrl,
                        "Sec-Fetch-Dest": "empty",
                        "Sec-Fetch-Mode": "cors",
                        "Sec-Fetch-Site": "same-origin",
                    };
                    const ajaxUrl = `${this.getBaseUrl()}/wp-content/themes/movies2023/Ajaxat/Single/Server.php`;
                    const res = await this.client.post(ajaxUrl, {
                        headers: ajaxHeaders,
                        body: `id=${dataId}&i=${dataServer}`
                    });
                    const iframeSrc = new Document(res.body).selectFirst("iframe") ? .getSrc;
                    await this._processLink(videos, iframeSrc, serverName);
                } catch (e) {
                    if (this.getPreference("show_embed_url_in_quality")) {
                        videos.push({
                            url: "",
                            originalUrl: serverName,
                            quality: `[Debug AJAX Error] ${serverName}`
                        });
                    }
                }
            }
        } catch (e) {}
        return videos;
    }
    async _getDownloadLinks(url) {
        const videos = [];
        const downloadPageUrl = url.replace(/\/watch\/?$/, '') + (url.endsWith('/') ? 'download/' : '/download/');
        try {
            const doc = await this.requestDoc(downloadPageUrl.replace(this.getBaseUrl(), ''));
            const proServerLink = doc.selectFirst("div.proServer a.downloadsLink");
            if (proServerLink) {
                const serverName = proServerLink.selectFirst(".text span") ? .text.trim();
                await this._processLink(videos, proServerLink.getHref, `[DL] ${serverName}`);
            }
            for (const block of doc.select("div.DownloadBlock")) {
                const qualityLabel = block.selectFirst("h2.download-title span") ? .text.trim();
                for (const linkEl of block.select("a.downloadsLink")) {
                    const serverName = linkEl.selectFirst(".text span") ? .text.trim();
                    const prefix = `[DL] ${serverName}` + (qualityLabel ? ` - ${qualityLabel}` : '');
                    await this._processLink(videos, linkEl.getHref, prefix);
                }
            }
        } catch (e) {}
        return videos;
    }

    // --- UNIVERSAL LINK PROCESSING LOGIC ---
    async _processLink(videoList, url, prefix) {
        const processedUrls = new Set(videoList.map(v => v.originalUrl));
        if (!url || processedUrls.has(url)) return;
        const hosterSelection = this.getPreference("hoster_selection") || [];
        const initialVideoCount = videoList.length;
        let embedUrl = url;
        if (url.includes("vidtube.pro/d/")) embedUrl = url.replace("/d/", "/embed-");
        else if (url.includes("updown.cam/")) embedUrl = `https://updown.cam/embed-${url.split('/').pop()}.html`;
        else if (url.includes("savefiles.com/")) embedUrl = `https://savefiles.com/e/${url.split('/').pop()}`;
        try {
            let foundVideos = false;
            const extractor = this.extractorMap.find(ext => hosterSelection.includes(ext.key) && ext.domains.some(d => embedUrl.includes(d)));
            if (extractor) {
                const extracted = await extractor.func.call(this, embedUrl, prefix);
                if (extracted.length > 0) {
                    videoList.push(...extracted);
                    foundVideos = true;
                }
            }
            if (!foundVideos && this.getPreference("use_fallback_extractor")) {
                const fallbackVideos = await this._allinoneExtractor(embedUrl, `[Fallback] ${prefix}`);
                if (fallbackVideos.length > 0) {
                    videoList.push(...fallbackVideos);
                    foundVideos = true;
                }
            }
            if (!foundVideos && hosterSelection.includes('other') && !prefix.startsWith('[DL]')) {
                let quality = `[Embed] ${prefix}`;
                if (this.getPreference("show_embed_url_in_quality")) quality += ` [${embedUrl}]`;
                videoList.push({
                    url: embedUrl,
                    originalUrl: embedUrl,
                    quality: quality
                });
            }
        } finally {
            const videosAdded = videoList.length - initialVideoCount;
            if (videosAdded === 0 && this.getPreference("show_embed_url_in_quality")) {
                const quality = `[Debug Fail] ${prefix} [${embedUrl}]`;
                videoList.push({
                    url: "",
                    originalUrl: embedUrl,
                    quality: quality
                });
            }
        }
    }

    // --- EXTRACTORS ---
    extractorMap = [{
        key: 'vidtube',
        domains: ['vidtube.pro'],
        func: this._vidtubeExtractor
    }, {
        key: 'updown',
        domains: ['updown.cam'],
        func: this._updownExtractor
    }, {
        key: 'savefiles',
        domains: ['savefiles.com'],
        func: this._savefilesExtractor
    }, {
        key: 'dood',
        domains: ['d0o0d.com', 'dood.yt'],
        func: this._doodstreamExtractor
    }, {
        key: 'streamwish',
        domains: ['streamwish.fun', 'vidhide.fun', 'filelions.to'],
        func: this._streamwishExtractor
    }, {
        key: 'streamtape',
        domains: ['streamtape.cc'],
        func: this._streamtapeExtractor
    }, {
        key: 'lulustream',
        domains: ['luluvdo.com'],
        func: this._lulustreamExtractor
    }, {
        key: 'uqload',
        domains: ['uqload.cx'],
        func: this._uqloadExtractor
    }, {
        key: 'filemoon',
        domains: ['filemoon.sx'],
        func: this._filemoonExtractor
    }, {
        key: 'mixdrop',
        domains: ['mixdrop.ps'],
        func: this._mixdropExtractor
    }, ];
    _formatQuality(prefix, url, qualitySuffix = "") {
        const showUrl = this.getPreference("show_video_url_in_quality");
        let quality = `${prefix} ${qualitySuffix}`.trim();
        if (showUrl) quality += ` - ${url}`;
        return quality;
    }
    async _parseM3U8(playlistUrl, prefix, headers = {}) {
        const videos = [];
        try {
            const playlistContent = (await this.client.get(playlistUrl, headers)).body;
            const baseUrl = playlistUrl.substring(0, playlistUrl.lastIndexOf('/') + 1);
            const lines = playlistContent.split('\n');
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].startsWith("#EXT-X-STREAM-INF")) {
                    const resolution = lines[i].match(/RESOLUTION=(\d+x\d+)/) ? .[1];
                    const quality = resolution ? resolution.split('x')[1] + "p" : "Unknown";
                    let videoUrl = lines[++i];
                    if (videoUrl && !videoUrl.startsWith('http')) videoUrl = baseUrl + videoUrl;
                    if (videoUrl) videos.push({
                        url: videoUrl,
                        originalUrl: videoUrl,
                        quality: this._formatQuality(prefix, videoUrl, quality),
                        headers
                    });
                }
            }
        } catch (e) {}
        if (videos.length === 0) videos.push({
            url: playlistUrl,
            originalUrl: playlistUrl,
            quality: this._formatQuality(prefix, playlistUrl, "Auto HLS"),
            headers
        });
        return videos;
    }
    async _vidtubeExtractor(url, prefix) {
        const res = await this.client.get(url, this.getHeaders(url));
        let script = res.body.substringAfter("eval(function(p,a,c,k,e,d)").substringBefore("</script>");
        if (!script) return [];
        script = "eval(function(p,a,c,k,e,d)" + script;
        const unpacked = unpackJs(script);
        const sourcesRegex = /{file:"([^"]+)",label:"([^"]+)"}/g;
        let match;
        const videos = [];
        while ((match = sourcesRegex.exec(unpacked)) !== null) {
            videos.push({
                url: match[1],
                originalUrl: match[1],
                quality: this._formatQuality(prefix, match[1], match[2]),
                headers: this._getVideoHeaders(url)
            });
        }
        return videos;
    }
    async _updownExtractor(url, prefix) {
        const res = await this.client.get(url, this.getHeaders(url));
        let script = res.body.substringAfter("eval(function(p,a,c,k,e,d)").substringBefore("</script>");
        if (!script) return [];
        script = "eval(function(p,a,c,k,e,d)" + script;
        const unpacked = unpackJs(script);
        const videoUrl = unpacked.match(/file:"([^"]+)"/) ? .[1];
        if (videoUrl) {
            return [{
                url: videoUrl,
                originalUrl: videoUrl,
                quality: this._formatQuality(prefix, videoUrl, "Direct"),
                headers: this._getVideoHeaders(url)
            }];
        }
        return [];
    }
    async _savefilesExtractor(url, prefix) {
        const res = await this.client.get(url, this.getHeaders(url));
        const fileCode = res.body.match(/name="file_code" value="([^"]+)"/) ? .[1];
        if (!fileCode) return [];
        const postRes = await this.client.post(new URL(url).origin + "/dl", {
            headers: this._getVideoHeaders(url),
            body: `op=embed&file_code=${fileCode}`
        });
        let script = postRes.body.substringAfter("eval(function(p,a,c,k,e,d)").substringBefore("</script>");
        if (!script) return [];
        script = "eval(function(p,a,c,k,e,d)" + script;
        const unpacked = unpackJs(script);
        const masterUrl = unpacked.match(/sources:\s*\[{src:"([^"]+)"/) ? .[1];
        return masterUrl ? this._parseM3U8(masterUrl, prefix, this._getVideoHeaders(url)) : [];
    }
    async _streamwishExtractor(url, prefix) {
        const res = await this.client.get(url, this.getHeaders(url));
        const script = res.body.substringAfter("eval(function(p,a,c,k,e,d)").substringBefore("</script>");
        if (!script) return [];
        const unpacked = unpackJs("eval(function(p,a,c,k,e,d)" + script);
        const masterUrl = unpacked.match(/(https?:\/\/[^"]+\.m3u8[^"]*)/) ? .[1];
        return masterUrl ? this._parseM3U8(masterUrl, prefix, this._getVideoHeaders(url)) : [];
    }
    async _filemoonExtractor(url, prefix) {
        const res = await this.client.get(url, this.getHeaders(url));
        const script = res.body.substringAfter("eval(function(p,a,c,k,e,d)").substringBefore("</script>");
        if (!script) return [];
        const unpacked = unpackJs("eval(function(p,a,c,k,e,d)" + script);
        const masterUrl = unpacked.match(/(https?:\/\/[^"]+\.m3u8[^"]*)/) ? .[1];
        return masterUrl ? this._parseM3U8(masterUrl, prefix, this._getVideoHeaders(url)) : [];
    }
    async _lulustreamExtractor(url, prefix) {
        const res = await this.client.get(url, this.getHeaders(url));
        const masterUrl = res.body.substringAfter('file:"').substringBefore('"');
        return masterUrl ? this._parseM3U8(masterUrl, prefix, this._getVideoHeaders(url)) : [];
    }
    async _mixdropExtractor(url, prefix) {
        const res = await this.client.get(url, this.getHeaders(url));
        const script = res.body.substringAfter("eval(function(p,a,c,k,e,d)").substringBefore("</script>");
        if (!script) return [];
        const unpacked = unpackJs("eval(function(p,a,c,k,e,d)" + script);
        const videoUrlPart = unpacked.match(/MDCore\.wurl=['"]([^'"]+)['"]/) ? .[1];
        if (!videoUrlPart) return [];
        const videoUrl = videoUrlPart.startsWith("http") ? videoUrlPart : "https:" + videoUrlPart;
        return [{
            url: videoUrl,
            quality: this._formatQuality(prefix, videoUrl, "Direct"),
            originalUrl: videoUrl,
            headers: this._getVideoHeaders(url)
        }];
    }
    async _doodstreamExtractor(url, prefix) {
        const res = await this.client.get(url, this.getHeaders(url));
        const pass_md5_path = res.body.substringAfter("'/pass_md5/").substringBefore("'");
        if (!pass_md5_path) return [];
        const pass_md5_url = new URL(url).origin + "/pass_md5/" + pass_md5_path;
        const doodtoken = Math.random().toString(36).substring(7);
        const video_url_res = await this.client.get(pass_md5_url, {
            headers: {
                "Referer": url
            }
        });
        const video_url = video_url_res.body + "z" + doodtoken + "?token=" + doodtoken;
        return [{
            url: video_url,
            quality: this._formatQuality(prefix, video_url, "Direct"),
            originalUrl: video_url,
            headers: this._getVideoHeaders(url)
        }];
    }
    async _streamtapeExtractor(url, prefix) {
        const res = await this.client.get(url, this.getHeaders(url));
        const script = res.body.substringAfter("document.getElementById('robotlink')").substringBefore("</script>");
        if (!script) return [];
        const finalUrl = "https:" + script.substringAfter("innerHTML = '").substringBefore("'") + script.substringAfter("+ ('xcd").substringBefore("'");
        return [{
            url: finalUrl,
            quality: this._formatQuality(prefix, finalUrl, "Direct"),
            originalUrl: finalUrl,
            headers: this._getVideoHeaders(url)
        }];
    }
    async _uqloadExtractor(url, prefix) {
        const res = await this.client.get(url, this.getHeaders(url));
        const videoUrl = res.body.substringAfter('sources: ["').substringBefore('"]');
        return videoUrl.startsWith("http") ? [{
            url: videoUrl,
            quality: this._formatQuality(prefix, videoUrl, "Direct"),
            originalUrl: videoUrl,
            headers: this._getVideoHeaders("https://uqload.to/")
        }] : [];
    }
    async _allinoneExtractor(url, prefix) {
        try {
            const res = await this.client.get(url, this._getVideoHeaders(url));
            const body = res.body,
                doc = new Document(body),
                videoHeaders = this._getVideoHeaders(url);
            let sources = [];
            const directVideoSrc = doc.selectFirst("source[src]") ? .getSrc || doc.selectFirst("video[src]") ? .getSrc;
            if (directVideoSrc) sources.push(directVideoSrc);
            let potentialScripts = body;
            const packedScriptMatch = body.match(/eval\(function\(p,a,c,k,e,d\)\s?{.*}\)/);
            if (packedScriptMatch) try {
                potentialScripts += "\n" + unpackJs(packedScriptMatch[0]);
            } catch (e) {}
            const urlRegex = /(https?:\/\/[^"' \s]+\.(?:m3u8|mp4|webm|mkv|mov|flv|avi))[^"' \s]*/ig;
            let match;
            while ((match = urlRegex.exec(potentialScripts)) !== null) sources.push(match[0]);
            const uniqueSources = [...new Set(sources.filter(s => s && s.startsWith("http")))];
            const allVideos = [];
            for (const sourceUrl of uniqueSources) {
                if (sourceUrl.includes(".m3u8")) allVideos.push(...await this._parseM3U8(sourceUrl, prefix, videoHeaders));
                else allVideos.push({
                    url: sourceUrl,
                    originalUrl: sourceUrl,
                    quality: this._formatQuality(prefix, sourceUrl, "Direct"),
                    headers: videoHeaders
                });
            }
            return allVideos;
        } catch (e) {
            return [];
        }
    }

    // --- FILTERS AND PREFERENCES ---
    getFilterList() {
        const categories = [{
            "name": "اختر",
            "query": ""
        }, {
            "name": "كل الافلام",
            "query": "/movies/"
        }, {
            "name": "افلام اجنبى",
            "query": "/category/افلام-اجنبي-3/"
        }, {
            "name": "افلام انمى",
            "query": "/category/افلام-انمي-1/"
        }, {
            "name": "افلام اسيويه",
            "query": "/category/افلام-اسيوي/"
        }, {
            "name": "افلام نتفليكس",
            "query": "/netflix-movies/"
        }, {
            "name": "سلاسل الافلام",
            "query": "/movies/"
        }, {
            "name": "الاعلي تقييما",
            "query": "/top-rating-imdb/"
        }, {
            "name": "مسلسلات اجنبى",
            "query": "/category/مسلسلات-اجنبي/"
        }, {
            "name": "مسلسلات اجنبى نتفليكس",
            "query": "/netflix-series/?cat=7"
        }, {
            "name": "مسلسلات اسيوية",
            "query": "/category/مسلسلات-اسيوية-7/"
        }, {
            "name": "مسلسلات اسيوية نتفليكس",
            "query": "/netflix-series/?cat=9"
        }, {
            "name": "مسلسلات انمي",
            "query": "/category/مسلسلات-انمي-1/"
        }, {
            "name": "مسلسلات انمي نتفلكس",
            "query": "/netflix-series/?cat=8"
        }, {
            "name": "احدث حلقات الانمي",
            "query": "/category/مسلسلات-انمي-1/?key=episodes"
        }];
        return [{
            type_name: "SelectFilter",
            name: "الأقسام",
            state: 0,
            values: categories.map(c => ({
                type_name: "SelectOption",
                name: c.name,
                value: c.query
            }))
        }];
    }
    getSourcePreferences() {
        return [{
            key: "preferred_quality",
            listPreference: {
                title: "الجودة المفضلة",
                summary: "اختر الجودة التي سيتم اختيارها تلقائيا",
                valueIndex: 1,
                entries: ["1080p", "720p", "480p"],
                entryValues: ["1080", "720", "480"],
            }
        }, {
            key: "link_fetch_mode",
            listPreference: {
                title: "طريقة جلب الروابط",
                summary: "اختر من أي صفحة تريد جلب الروابط",
                valueIndex: 0,
                entries: ["مشاهدة وتحميل معاً", "صفحة المشاهدة فقط", "صفحة التحميل فقط"],
                entryValues: ["both", "watch", "download"]
            }
        }, {
            key: "hoster_selection",
            multiSelectListPreference: {
                title: "اختر السيرفرات",
                summary: "اختر السيرفرات التي تريد ان تظهر",
                entries: ["Vidtube", "UpDown", "Savefiles", "Doodstream", "StreamWish / Filelions", "Streamtape", "Lulustream", "Uqload", "Filemoon", "Mixdrop", "Other Embeds"],
                entryValues: ["vidtube", "updown", "savefiles", "dood", "streamwish", "streamtape", "lulustream", "uqload", "filemoon", "mixdrop", "other"],
                values: ["vidtube", "updown", "streamwish", "dood"],
            }
        }, {
            key: "show_video_url_in_quality",
            switchPreferenceCompat: {
                title: "إظهار رابط الفيديو (للتصحيح)",
                summary: "عرض رابط الفيديو النهائي بجانب اسم الجودة",
                value: false,
            }
        }, {
            key: "show_embed_url_in_quality",
            switchPreferenceCompat: {
                title: "إظهار رابط التضمين (للتصحيح)",
                summary: "عرض رابط التضمين الأولي بجانب اسم الجودة",
                value: false,
            }
        }, {
            key: "use_fallback_extractor",
            switchPreferenceCompat: {
                title: "استخدام مستخرج احتياطي (تجريبي)",
                summary: "عندما يفشل مستخرج الفيديو الأساسي، حاول استخدام مستخرج عام",
                value: false,
            }
        }];
    }
}

function unpackJs(packedJS) {
    function unq(s) {
        s = s || "";
        if ((s[0] === '"' || s[0] === "'") && s[s.length - 1] === s[0]) {
            s = s.slice(1, -1);
        }
        s = s.replace(/\\x([0-9A-Fa-f]{2})/g, (m, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\u([0-9A-Fa-f]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\\\/g, '\\').replace(/\\\//g, '/').replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\'/g, "'");
        return s;
    }

    function itob(n, b) {
        if (n === 0) return "0";
        var d = "0123456789abcdefghijklmnopqrstuvwxyz",
            o = "";
        while (n) {
            o = d[n % b] + o;
            n = Math.floor(n / b);
        }
        return o;
    }
    try {
        const re = /eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*d\s*\)\s*\{[\s\S]*?\}\s*\(\s*(['"])([\s\S]*?)\1\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"])([\s\S]*?)\5\.split\(['"]\|['"]\)/i;
        let match = packedJS.match(re);
        if (!match) {
            const oldMatch = packedJS.match(/eval\(function\(p,a,c,k,e,d\){.*}\((.*)\)\)/);
            if (oldMatch) {
                let args = oldMatch[1].split(',').map(arg => arg.trim());
                let p = args[0].replace(/^'|'$/g, '');
                let a = parseInt(args[1]);
                let c = parseInt(args[2]);
                let k = args[3].replace(/^'|'$/g, '').split('|');
                while (c--)
                    if (k[c]) p = p.replace(new RegExp('\\b' + c.toString(a) + '\\b', 'g'), k[c]);
                return p;
            }
            return packedJS;
        }
        let p = unq(match[1] + match[2] + match[1]),
            a = +match[3],
            c = +match[4],
            k = unq("'" + match[6] + "'").split("|");
        if (k.length < c) {
            for (var i = k.length; i < c; i++) k[i] = "";
        }
        for (i = c - 1; i >= 0; i--) {
            let t = itob(i, a),
                r = k[i] || t;
            p = p.replace(new RegExp('\\b' + t + '\\b', 'g'), r);
        }
        return p;
    } catch (e) {
        return packedJS;
    }
}
