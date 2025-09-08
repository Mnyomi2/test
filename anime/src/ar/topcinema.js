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
        this._allSources = mangayomiSources;
        this.source.baseUrl = this.source.baseUrl.trim();
        this._defaultHeaders = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.75 Safari/536.36",
        };
    }

    getHeaders(url) {
        return {
            "Referer": this.getBaseUrl() + "/",
            "Origin": this.getBaseUrl(),
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/536.36"
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
	
    getPreference(key) {
        return new SharedPreferences().get(key);
    }

    async requestDoc(path, headers = {}) {
        const url = this.source.baseUrl + path;
        const res = await this.request(url, headers);
        return new Document(res.body);
    }

    async request(url, headers = {}) {
        const requestHeaders = { ...this._defaultHeaders, ...headers };
        const res = await this.client.get(url, { headers: requestHeaders });
        return res;
    }

    resolveRelativeUrl(path, baseUrl) {
        if (!path) return baseUrl;
        if (path.startsWith('http://') || path.startsWith('https://')) return path;
        const baseOriginMatch = baseUrl.match(/^(https?:\/\/[^/]+)/);
        const baseOrigin = baseOriginMatch ? baseOriginMatch[1] : '';
        if (path.startsWith('/')) return `${baseOrigin}${path}`;
        const lastSlashIndex = baseUrl.lastIndexOf('/');
        const basePath = (lastSlashIndex > (baseOrigin.length + 2)) ? baseUrl.substring(0, lastSlashIndex + 1) : `${baseOrigin}/`;
        return `${basePath}${path}`;
    }

    _titleEdit(title) { 
        let editedTitle = title ? title.trim() : ""; 
        if (!editedTitle) return editedTitle;
        const arabicSeasonMap = { "الاول": "1", "الثاني": "2", "الثالث": "3", "الرابع": "4", "الخامس": "5", "السادس": "6", "السابع": "7", "الثامن": "8", "التاسع": "9", "العاشر": "10", "الحادي عشر": "11", "الثاني عشر": "12" };
        editedTitle = editedTitle.replace(/[\u2013\u2014\u2015\u2212]/g, '-');
        editedTitle = editedTitle.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s*\[.*?\]\s*/g, ' ');
        let extractedYear = '';
        editedTitle = editedTitle.replace(/\b(\d{4})\b/, (match, p1) => { extractedYear = p1; return ''; });
        editedTitle = editedTitle.replace(/^(?:فيلم|عرض|مسلسل|برنامج|انمي)\s+/i, '');
        for (const key in arabicSeasonMap) {
            const regex = new RegExp(`الموسم\\s*(?:ال)*${key}\\b`, 'gi'); 
            editedTitle = editedTitle.replace(regex, `الموسم ${arabicSeasonMap[key]}`);
        }
        editedTitle = editedTitle.replace(/الموسم\s*(\d+)/gi, 's$1').replace(/الحلقة\s*(\d+)/gi, 'E$1');
        editedTitle = editedTitle.replace(/\s+(?:مترجم|مترجمة|مدبلج|مدبلجة|اون لاين|اونلاين|كامل|بجودة|جودة|عالية|حصريا|مشاهدة)\s*$/gi, '');
        editedTitle = editedTitle.replace(/\b(?:HD|4K|FHD|UHD|HDRip|BluRay|WEB-DL|720p|1080p)\b/gi, '');
        editedTitle = editedTitle.replace(/\s+/g, ' ');
        if (extractedYear) editedTitle += ` (${extractedYear})`;
        return editedTitle.trim();
    }
    
    // Helper function to format the quality string based on user preferences.
    _formatQuality(quality, url) {
        const showVideoUrl = this.getPreference("show_video_url_in_quality");
        if (showVideoUrl && url) {
            return `${quality} [${url}]`;
        }
        return quality;
    }

    async _processListingItems(doc) {
        const list = [];
        const items = doc.select("div.Block--Item, div.Small--Box");
        for (const item of items) {
            const linkElement = item.selectFirst("a");
            if (!linkElement) continue;
            const link = linkElement.getHref;
            const rawTitle = linkElement.attr("title") || item.selectFirst("h3.title")?.text;
            const name = this._titleEdit(rawTitle);
            const imageUrl = item.selectFirst("img")?.attr("data-src");
            if (link.includes('/series/')) {
                try {
                    const seriesDoc = await this.requestDoc(link.replace(this.source.baseUrl, ''));
                    const seasonElements = seriesDoc.select("section.allseasonss div.Small--Box.Season");
                    if (seasonElements.length > 0) {
                        for (const season of seasonElements) {
                            const sLinkEl = season.selectFirst("a");
                            if (!sLinkEl) continue;
                            const sTitle = sLinkEl.attr("title") || season.selectFirst("h3.title")?.text;
                            list.push({ name: this._titleEdit(sTitle), imageUrl: season.selectFirst("img")?.attr("data-src"), link: sLinkEl.getHref });
                        }
                    } else list.push({ name, imageUrl, link });
                } catch (e) { list.push({ name, imageUrl, link }); }
            } else list.push({ name, imageUrl, link });
        }
        return list;
    }

    async getPopular(page) {
        const doc = await this.requestDoc(`/movies/page/${page}/`); 
        return { list: await this._processListingItems(doc), hasNextPage: !!doc.selectFirst("div.pagination a.next") };
    }

    async getLatestUpdates(page) {
        const doc = await this.requestDoc(`/recent/page/${page}/`);
        return { list: await this._processListingItems(doc), hasNextPage: !!doc.selectFirst("div.pagination a.next") };
    }

    async search(query, page, filters) {
        let path;
        const categoryFilter = filters[0];
        if (query) {
            path = `/search/?query=${encodeURIComponent(query)}&offset=${page - 1}`;
        } else {
            const selectedCategory = categoryFilter.values[categoryFilter.state].value;
            if (selectedCategory) {
                path = `${selectedCategory.endsWith('/') ? selectedCategory : selectedCategory + '/'}page/${page}/`;
            } else return this.getPopular(page);
        }
        const doc = await this.requestDoc(path);
        return { list: await this._processListingItems(doc), hasNextPage: !!doc.selectFirst("div.pagination a.next") };
    }

    async getDetail(url) {
        const doc = await this.requestDoc(url.replace(this.source.baseUrl, ''));
        const name = this._titleEdit(doc.selectFirst("h1.post-title")?.text);
        const imageUrl = doc.selectFirst("div.image img")?.getSrc;
        const description = doc.selectFirst("div.story")?.text.trim();
        const genre = doc.select("div.catssection li a").map(e => e.text);
        const chapters = [];
        const episodeElements = doc.select("section.allepcont div.row a");
        if (episodeElements.length > 0) {
            episodeElements.forEach(ep => chapters.push({ name: this._titleEdit(ep.attr("title")), url: ep.getHref }));
        } else {
            chapters.push({ name: "مشاهدة", url: url });
        }
        return { name, imageUrl, description, genre, status: 1, chapters, link: url };
    }


    // --- VIDEO EXTRACTION ---

    async getVideoList(url) {
        const pageUrl = this.getBaseUrl() + url;
        const res = await this.client.get(pageUrl, this.getHeaders(pageUrl));
        const doc = new Document(res.body);
        const hosterSelection = this.getPreference("hoster_selection") || [];
        const showEmbedUrl = this.getPreference("show_embed_url_in_quality");
        const videos = [];

        const extractorMap = [
            { key: 'vidtube',    domains: ['vidtube.pro'],    func: this._streamwishExtractor, useQuality: false }, // Vidtube is often a StreamWish variant
            { key: 'updown',     domains: ['up-down.to'],     func: this._streamwishExtractor, useQuality: false }, // UpDown is often a StreamWish variant
            { key: 'filelions',  domains: ['filelions.to'],   func: this._streamwishExtractor, useQuality: false }, // FileLions is a StreamWish variant
            { key: 'mp4upload',  domains: ['mp4upload'],      func: this._mp4uploadExtractor,  useQuality: true },
            { key: 'dood',       domains: ['dood', 'd-s.io'], func: this._doodstreamExtractor, useQuality: true },
            { key: 'okru',       domains: ['ok.ru'],          func: this._okruExtractor,       useQuality: false },
            { key: 'voe',        domains: ['voe.sx'],         func: this._voeExtractor,        useQuality: false },
            { key: 'vidmoly',    domains: ['vidmoly'],        func: this._vidmolyExtractor,    useQuality: false },
            { key: 'uqload',     domains: ['uqload'],         func: this._uqloadExtractor,     useQuality: true },
            { key: 'megamax',    domains: ['megamax'],        func: this._megamaxExtractor,    useQuality: false },
            { key: 'vk',         domains: ['vk.com'],         func: this._vkExtractor,   useQuality: false },
            { key: 'videa',      domains: ['videa.hu'],       func: this._videaExtractor,      useQuality: true },
            { key: 'dailymotion',domains: ['dailymotion'],    func: this._dailymotionExtractor,useQuality: false },
            { key: 'sendvid',    domains: ['sendvid'],        func: this._sendvidExtractor,    useQuality: true },
            { key: 'streamtape', domains: ['streamtape'],     func: this._streamtapeExtractor, useQuality: true },
            { key: 'streamwish', domains: ['streamwish'],     func: this._streamwishExtractor, useQuality: false },
            { key: 'filemoon',   domains: ['filemoon'],       func: this._filemoonExtractor, useQuality: false },
            { key: 'vidguard',   domains: ['vidguard'],       func: this._vidguardExtractor, useQuality: false },
            { key: 'lulustream', domains: ['luluvid'],        func: this._lulustreamExtractor, useQuality: false },
            { key: 'mixdrop',    domains: ['mixdrop'],        func: this._mixdropExtractor,  useQuality: true },
            { key: 'streamruby', domains: ['streamruby'],     func: this._streamrubyExtractor, useQuality: false },
            { key: 'upstream',   domains: ['upstream'],       func: this._upstreamExtractor,   useQuality: false },
        ];

        // The endpoint for fetching the server iframe
        const serverApiUrl = `${this.getBaseUrl()}/wp-content/themes/movies2023/Ajaxat/Single/Server.php`;

        // Iterate over the server list items provided in the new HTML structure
        for (const element of doc.select(".watch--servers--list li.server--item")) {
            let streamUrl = null;
            let serverNameText = null;
            let qualityPrefix = null;

            try {
                const postId = element.attr('data-id');
                const serverIndex = element.attr('data-server');
                serverNameText = element.selectFirst('span')?.text.trim();

                if (!postId || !serverIndex || !serverNameText) continue;

                const serverKey = serverNameText.toLowerCase().replace('stream','');
                if (!hosterSelection.includes(serverKey) && !hosterSelection.some(h => serverNameText.toLowerCase().includes(h))) {
                    continue;
                }

                // Make the POST request to get the iframe URL
                const postBody = `id=${postId}&i=${serverIndex}`;
                const postHeaders = {
                    "Accept": "*/*",
                    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                    "X-Requested-With": "XMLHttpRequest",
                    "Referer": pageUrl,
                    "Origin": this.getBaseUrl(),
                };

                const postRes = await this.client.post(serverApiUrl, { headers: postHeaders, body: postBody });
                const iframeDoc = new Document(postRes.body);
                streamUrl = iframeDoc.selectFirst("iframe")?.getSrc;

                if (!streamUrl) continue;
                
                if (streamUrl.startsWith("//")) streamUrl = "https:" + streamUrl;
                
                const extractor = extractorMap.find(ext => ext.domains.some(d => streamUrl.toLowerCase().includes(d)));
                
                qualityPrefix = serverNameText; // The quality is unknown at this stage, so we just use the server name
                if (showEmbedUrl) {
                    qualityPrefix += ` [${streamUrl}]`;
                }

                if (extractor) {
                    const extractedVideos = await extractor.func.call(this, streamUrl, qualityPrefix);
                    if (extractedVideos && extractedVideos.length > 0) {
                        videos.push(...extractedVideos);
                    }
                }

            } catch (e) {
                const useFallback = this.getPreference("use_fallback_extractor");
                if (useFallback && streamUrl && serverNameText) {
                    const fallbackVideos = await this._allinoneExtractor(streamUrl, `[Fallback] ${serverNameText}`);
                    if (fallbackVideos && fallbackVideos.length > 0) {
                        videos.push(...fallbackVideos);
                    } else if (showEmbedUrl && qualityPrefix) {
                        videos.push({ url: "", originalUrl: streamUrl, quality: `[Failed] ${qualityPrefix}`, headers: {} });
                    }
                } else if (showEmbedUrl && streamUrl && qualityPrefix) {
                    videos.push({ url: "", originalUrl: streamUrl, quality: `[Failed] ${qualityPrefix}`, headers: {} });
                }
            }
        }
        
        const preferredQuality = this.getPreference("preferred_quality") || "720";
        videos.sort((a, b) => {
            const qualityA = parseInt(a.quality.match(/(\d+)p/)?.[1] || 0);
            const qualityB = parseInt(b.quality.match(/(\d+)p/)?.[1] || 0);
            const isAPreferred = a.quality.includes(preferredQuality);
            const isBPreferred = b.quality.includes(preferredQuality);
            return (qualityB + (isBPreferred ? 10000 : 0)) - (qualityA + (isAPreferred ? 10000 : 0));
        });

        return videos;
    }
    
    // --- EXTRACTORS ---

    async _parseM3U8(playlistUrl, prefix, headers = {}) {
        const videos = [];
        videos.push({ url: playlistUrl, originalUrl: playlistUrl, quality: this._formatQuality(`${prefix} Auto (HLS)`, playlistUrl), headers });
        if (!this.getPreference("extract_qualities")) return videos;
        try {
            const playlistContent = (await this.client.get(playlistUrl, headers)).body;
            const baseUrl = playlistUrl.substring(0, playlistUrl.lastIndexOf('/') + 1);
            const lines = playlistContent.split('\n');
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].startsWith("#EXT-X-STREAM-INF")) {
                    const resolution = lines[i].match(/RESOLUTION=(\d+x\d+)/)?.[1];
                    const quality = resolution ? resolution.split('x')[1] + "p" : "Unknown";
                    let videoUrl = lines[++i];
                    if (videoUrl && !videoUrl.startsWith('http')) videoUrl = baseUrl + videoUrl;
                    if (videoUrl) videos.push({ url: videoUrl, originalUrl: videoUrl, quality: this._formatQuality(`${prefix} ${quality}`, videoUrl), headers });
                }
            }
        } catch(e) { /* Return master playlist on error */ }
        return videos;
    }

    async _vidguardExtractor(url, prefix) {
        try {
            const transformedUrl = url.replace(/vidguard\.to|mivalyo\.com/g, "listeamed.net");
            const headers = this._getVideoHeaders(transformedUrl);
    
            const res = await this.client.get(transformedUrl, headers);
            
            const scriptBody = res.body.substringAfter("eval(function(p,a,c,k,e,d)").substringBefore("</script>");
            if (!scriptBody) return [];
            const scriptCode = "eval(function(p,a,c,k,e,d)" + scriptBody;
    
            const unpacked = unpackJs(scriptCode);
            
            const playlistUrl = unpacked.match(/stream:"([^"]+)"/)?.[1];
            if (!playlistUrl) return [];
    
            const encodedMatch = playlistUrl.match(/sig=([^&]+)/);
            if (!encodedMatch) return [];
            const encoded = encodedMatch[1];
            
            const charCodes = [];
            for (let i = 0; i < encoded.length; i += 2) {
                charCodes.push(parseInt(encoded.slice(i, i + 2), 16) ^ 2);
            }
    
            const decodedB64String = String.fromCharCode(...charCodes);
            
            const rawByteString = atob(decodedB64String);
            let byteArray = new Uint8Array(rawByteString.length);
            for (let i = 0; i < rawByteString.length; i++) {
                byteArray[i] = rawByteString.charCodeAt(i);
            }
    
            let decoded = byteArray.slice(5, -5).reverse();
    
            const swapLimit = decoded.length - (decoded.length % 2);
            for (let i = 0; i < swapLimit; i += 2) {
                let tmp = decoded[i];
                decoded[i] = decoded[i + 1];
                decoded[i + 1] = tmp;
            }
    
            const finalDecodedSig = new TextDecoder().decode(decoded);
    
            const finalUrl = playlistUrl.replace(encoded, finalDecodedSig);
    
            return await this._parseM3U8(finalUrl, prefix, headers);
        } catch (e) {
            return [];
        }
    }
    
    async _mp4uploadExtractor(url, quality) {
        const embedHtml = (await this.client.get(url, this._getVideoHeaders(url))).body;
        const sourceMatch = embedHtml.match(/player\.src\({[^}]+src:\s*"([^"]+)"/);
        return sourceMatch ? [{ url: sourceMatch[1], originalUrl: sourceMatch[1], quality: this._formatQuality(quality, sourceMatch[1]), headers: { "Referer": url } }] : [];
    }

    async _doodstreamExtractor(url, quality) {
        try {
            const videoId = url.split('/').pop();
            if (!videoId) return [];

            const downloadPageUrl = `https://d-s.io/d/${videoId}`;
            const res1 = await this.client.get(downloadPageUrl, this._getVideoHeaders(url));
            const doc1 = new Document(res1.body);
            const secondLinkPath = doc1.selectFirst(".download-content a[href*='/download/']")?.attr("href");
            if (!secondLinkPath) return [];

            const secondUrl = `https://d-s.io${secondLinkPath}`;
            const res2 = await this.client.get(secondUrl, this._getVideoHeaders(downloadPageUrl));
            const doc2 = new Document(res2.body);
            const finalVideoUrl = doc2.selectFirst(".download-generated a.btn")?.attr("href");
            if (!finalVideoUrl) return [];

            return [{
                url: finalVideoUrl,
                quality: this._formatQuality(quality, finalVideoUrl),
                originalUrl: finalVideoUrl,
                headers: this._getVideoHeaders(url)
            }];
        } catch (e) {
            return [];
        }
    }

    async _voeExtractor(url, prefix = "Voe.sx") {
        try {
            const videoId = url.split('/').pop();
            if (!videoId) throw new Error("Could not find video ID");
            const downloadUrl = `https://kellywhatcould.com/${videoId}/download`;
            const res = await this.client.get(downloadUrl, this._getVideoHeaders(url));
            const doc = new Document(res.body);
            const videos = [];
            for (const linkElement of doc.select("a:has(small:contains(Direct Download Link))")) {
                let videoUrl = linkElement.attr("href");
                if (!videoUrl) continue;
                videoUrl = videoUrl.replace(/&amp;/g, '&');
                const quality = linkElement.text.match(/(\d+p)/)?.[1] || "";
                videos.push({ url: videoUrl, originalUrl: videoUrl, quality: this._formatQuality(`${prefix}`, videoUrl), headers: this._getVideoHeaders(url) });
            }
            if (videos.length > 0) {
                return videos.sort((a, b) => (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0));
            }
        } catch (e) { /* Fallback to HLS if download link method fails */ }
        const res = await this.client.get(url, this._getVideoHeaders(url));
        const hlsUrl = res.body.substringAfter("'hls': '").substringBefore("'");
        if (hlsUrl) { return this._parseM3U8(hlsUrl, prefix); }
        return [];
    }

    async _okruExtractor(url, prefix = "Okru") {
        const embedUrl = url.replace('/video/', '/videoembed/');
        const res = await this.client.get(embedUrl, this.getHeaders(embedUrl));
        const dataOptions = res.body.substringAfter("data-options=\"").substringBefore("\"");
        if (!dataOptions) return [];
        const videoHeaders = this._getVideoHeaders("https://ok.ru/");
        videoHeaders["Origin"] = "https://ok.ru";
        try {
            const json = JSON.parse(dataOptions.replace(/&quot;/g, '"'));
            const metadata = JSON.parse(json.flashvars.metadata);
            const videos = [];
            const getQualityName = (name) => ({ "full": "1080p", "hd": "720p", "sd": "480p", "low": "360p", "lowest": "240p", "mobile": "144p" }[name] || name);
            if (metadata.videos) {
                videos.push(...metadata.videos.map(video => ({
                    url: video.url, originalUrl: video.url, quality: this._formatQuality(`${prefix} ${getQualityName(video.name)}`, video.url), headers: videoHeaders
                })));
            }
            if (metadata.hlsManifestUrl) {
                videos.unshift({ url: metadata.hlsManifestUrl, originalUrl: metadata.hlsManifestUrl, quality: this._formatQuality(`${prefix} Auto (HLS)`, metadata.hlsManifestUrl), headers: videoHeaders });
            }
            if (videos.length > 1) { videos.unshift(videos.splice(videos.findIndex(v => v.quality.includes("Auto")), 1)[0]); videos.reverse(); }
            return videos;
        } catch (e) { return []; }
    }
    
    async _vidmolyExtractor(url, prefix) {
        const res = await this.client.get(url, this._getVideoHeaders(url));
        const hlsUrl = res.body.substringAfter('file:"').substringBefore('"');
        return (hlsUrl && hlsUrl.includes(".m3u8")) ? this._parseM3U8(hlsUrl, prefix, this._getVideoHeaders(url)) : [];
    }
    
    async _uqloadExtractor(url, quality) {
        const res = await this.client.get(url, this.getHeaders(url));
        const videoUrl = res.body.substringAfter('sources: ["').substringBefore('"]');
        return videoUrl.startsWith("http") ? [{ url: videoUrl, quality: this._formatQuality(quality, videoUrl), originalUrl: videoUrl, headers: this._getVideoHeaders("https://uqload.to/") }] : [];
    }

    async _megamaxExtractor(url, prefix) {
        const selectedDrivers = this.getPreference("megamax_driver_selection") || [];
        const allVideos = [];
        const showEmbedUrl = this.getPreference("show_embed_url_in_quality");
        try {
            const mainPageRes = await this.client.get(url, this._getVideoHeaders(url));
            const dataPageJson = new Document(mainPageRes.body).selectFirst("#app")?.attr("data-page");
            if (!dataPageJson) return [];
            const inertiaVersion = JSON.parse(dataPageJson).version;
            const apiHeaders = { ...this._getVideoHeaders(url), "Accept": "text/html, application/xhtml+xml", "X-Requested-With": "XMLHttpRequest", "X-Inertia": "true", "X-Inertia-Partial-Component": "files/mirror/video", "X-Inertia-Partial-Data": "streams", "X-Inertia-Version": inertiaVersion, };
            const apiRes = await this.client.get(url, apiHeaders);
            const apiData = JSON.parse(apiRes.body);
            if (apiData?.props?.streams?.status !== "success") return [];
            
            const driverToExtractor = {
                'mp4upload': { func: this._mp4uploadExtractor, useQuality: true },
                'doodstream': { func: this._doodstreamExtractor, useQuality: true },
                'okru': { func: this._okruExtractor, useQuality: false },
                'voe': { func: this._voeExtractor, useQuality: false },
                'vidmoly': { func: this._vidmolyExtractor, useQuality: false },
                'uqload': { func: this._uqloadExtractor, useQuality: true },
                'vk': { func: this._vkExtractor, useQuality: false },
                'videa': { func: this._videaExtractor, useQuality: true },
                'dailymotion': { func: this._dailymotionExtractor, useQuality: false },
                'sendvid': { func: this._sendvidExtractor, useQuality: true },
                'streamtape': { func: this._streamtapeExtractor, useQuality: true },
                'streamwish': { func: this._streamwishExtractor, useQuality: false },
                'filemoon': { func: this._filemoonExtractor, useQuality: false },
                'vidguard': { func: this._vidguardExtractor, useQuality: false },
                'darkibox': { func: this._streamwishExtractor, useQuality: false },
                'hexupload': { func: this._streamwishExtractor, useQuality: false },
                'bigwarp': { func: this._bigwarpExtractor, useQuality: false },
                'vidbam': { func: this._vidbomExtractor, useQuality: false },
                'lulustream': { func: this._lulustreamExtractor, useQuality: false },
                'mixdrop': { func: this._mixdropExtractor, useQuality: true },
                'streamruby': { func: this._streamrubyExtractor, useQuality: false },
                'veev': { func: this._upstreamExtractor, useQuality: false },
                'krakenfiles': { func: this._krakenfilesExtractor, useQuality: true },
                'thetube': { func: this._thetubeExtractor, useQuality: false },
                'vidhide': { func: this._streamwishExtractor, useQuality: false },
            };

            for (const qualityData of apiData.props.streams.data) {
                const qualityLabel = qualityData.label.replace(' (source)', '').trim();
                for (const mirror of qualityData.mirrors) {
                    if (!selectedDrivers.includes(mirror.driver)) {
                        continue;
                    }
                    const extractorData = driverToExtractor[mirror.driver];
                    if (!extractorData) continue; 

                    const mirrorLink = mirror.link.startsWith("//") ? "https:" + mirror.link : mirror.link;
                    const driverName = mirror.driver.charAt(0).toUpperCase() + mirror.driver.slice(1);
                    let qualityName = `${prefix} - ${driverName} - ${qualityLabel}`;
                    if (showEmbedUrl) {
                        qualityName += ` [${mirrorLink}]`;
                    }

                    try {
                        const subExtractorPrefix = qualityName;
                        const extractedVideos = await extractorData.func.call(this, mirrorLink, subExtractorPrefix);
                        if (extractedVideos && extractedVideos.length > 0) {
                            allVideos.push(...extractedVideos);
                        } else {
                            throw new Error("Extractor returned no videos.");
                        }
                    } catch (e) {
                        if (showEmbedUrl) {
                            allVideos.push({ url: "", originalUrl: mirrorLink, quality: `[Failed] ${qualityName}`, headers: {} });
                        }
                    }
                }
            }
            return allVideos;
        } catch(e) { return []; }
    }
    
    async _vkExtractor(url, prefix) {
        const videoHeaders = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
            "Referer": url,
            "Upgrade-Insecure-Requests": "1",
            "Sec-Fetch-Dest": "iframe",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "cross-site",
        };
        const res = await this.client.get(url, videoHeaders);
        
        const serverName = prefix.split(' - ')[0].trim();
        
        const matches = [...res.body.matchAll(/"url(\d+)":"(.*?)"/g)];
        
        const videos = matches.map(match => {
            const qualityLabel = `${serverName} ${match[1]}p`;
            const videoUrl = match[2].replace(/\\/g, '');
            return {
                url: videoUrl,
                originalUrl: videoUrl,
                quality: this._formatQuality(qualityLabel, videoUrl),
                headers: videoHeaders
            };
        });

        videos.sort((a, b) => {
            const qualityA = parseInt(a.quality.match(/(\d+)p/)?.[1] || 0);
            const qualityB = parseInt(b.quality.match(/(\d+)p/)?.[1] || 0);
            return qualityB - qualityA;
        });
        
        return videos;
    }

    async _videaExtractor(url, quality) {
        const res = await this.client.get(url, this.getHeaders(url));
        const videoUrl = res.body.substringAfter("v.player.source(").substringBefore(");").match(/'(https?:\/\/[^']+)'/)?.[1];
        return videoUrl ? [{ url: videoUrl, originalUrl: videoUrl, quality: this._formatQuality(quality, videoUrl), headers: this._getVideoHeaders(url) }] : [];
    }

    async _dailymotionExtractor(url, prefix) {
        const pageRes = await this.client.get(url, this._getVideoHeaders(url));
        const videoId = pageRes.body.match(/<link rel="canonical" href="[^"]+\/video\/([^"]+)"/)?.[1];
        if (!videoId) return [];
        const metadataRes = await this.client.get(`https://www.dailymotion.com/player/metadata/video/${videoId}`, this._getVideoHeaders(url));
        const masterUrl = JSON.parse(metadataRes.body)?.qualities?.auto?.[0]?.url;
        return (masterUrl && masterUrl.includes(".m3u8")) ? this._parseM3U8(masterUrl, prefix, this._getVideoHeaders(url)) : [];
    }

    async _sendvidExtractor(url, quality) {
        const res = await this.client.get(url, this._getVideoHeaders(url));
        const videoUrl = new Document(res.body).selectFirst("source#source-video")?.getSrc;
        return videoUrl ? [{ url: videoUrl, originalUrl: videoUrl, quality: this._formatQuality(quality, videoUrl), headers: this._getVideoHeaders(url) }] : [];
    }
    
    async _streamtapeExtractor(url, quality) {
        const res = await this.client.get(url, this.getHeaders(url));
        const script = res.body.substringAfter("document.getElementById('robotlink')").substringBefore("</script>");
        if (!script) return [];
        const finalUrl = "https:" + script.substringAfter("innerHTML = '").substringBefore("'") + script.substringAfter("+ ('xcd").substringBefore("'");
        return [{ url: finalUrl, quality: this._formatQuality(quality, finalUrl), originalUrl: finalUrl, headers: this._getVideoHeaders(url) }];
    }
    
    async _streamwishExtractor(url, prefix) {
        const res = await this.client.get(url, this.getHeaders(url));
        let script = res.body.substringAfter("eval(function(p,a,c,k,e,d)").substringBefore("</script>");
        if (!script) return [];

        script = "eval(function(p,a,c,k,e,d)" + script;
        const unpacked = unpackJs(script);
        
        const masterUrl = unpacked.match(/(https?:\/\/[^"]+\.m3u8[^"]*)/)?.[1];
        if (!masterUrl) return [];
        
        return this._parseM3U8(masterUrl, prefix, this._getVideoHeaders(url));
    }

    async _filemoonExtractor(url, prefix) {
        const res1 = await this.client.get(url, this._getVideoHeaders(url));
        const doc1 = new Document(res1.body);
        const iframeUrl = doc1.selectFirst("iframe[src]")?.getSrc;
        if (!iframeUrl) return [];

        const res2 = await this.client.get(iframeUrl, this._getVideoHeaders(url));
        let script = res2.body.substringAfter("eval(function(p,a,c,k,e,d)").substringBefore("</script>");
        if (!script) return [];

        script = "eval(function(p,a,c,k,e,d)" + script;
        const unpacked = unpackJs(script);
        
        const masterUrl = unpacked.match(/(https?:\/\/[^"]+\.m3u8[^"]*)/)?.[1];
        if (!masterUrl) return [];
        
        return this._parseM3U8(masterUrl, prefix, this._getVideoHeaders(iframeUrl));
    }
    
    async _vidbomExtractor(url, prefix = "VidBom") {
        const res = await this.client.get(url, this.getHeaders(url));
        const script = res.body.substringAfter("sources: [").substringBefore("]");
        if (!script) return [];
        const videoHeaders = this._getVideoHeaders(url);
        const sources = script.split('{file:"').slice(1);
        let allVideos = [];
        for (const source of sources) {
            const src = source.substringBefore('"');
            if (src.includes(".m3u8")) {
                allVideos.push(...await this._parseM3U8(src, prefix, videoHeaders));
            } else {
                const qualityLabel = `${prefix}: ` + source.substringAfter('label:"').substringBefore('"');
                allVideos.push({ url: src, originalUrl: src, quality: this._formatQuality(qualityLabel, src), headers: videoHeaders });
            }
        }
        return allVideos;
    }
    
    async _lulustreamExtractor(url, prefix = "Lulustream") {
        const res = await this.client.get(url, this.getHeaders(url));
        const script = res.body.substringAfter('jwplayer("vplayer").setup({').substringBefore('});');
        if (!script) return [];
        const masterUrl = script.match(/file:"([^"]+)"/)?.[1];
        return masterUrl ? this._parseM3U8(masterUrl, prefix, this._getVideoHeaders(url)) : [];
    }

    async _mixdropExtractor(url, quality) {
        const res = await this.client.get(url, this.getHeaders(url));
        const script = res.body.substringAfter("eval(function(p,a,c,k,e,d)").substringBefore("</script>");
        if (!script) return [];
        const unpacked = unpackJs(script);
        const videoUrlPart = unpacked.match(/MDCore\.wurl=['"]([^'"]+)['"]/)?.[1];
        if (!videoUrlPart) return [];
        const videoUrl = videoUrlPart.startsWith("http") ? videoUrlPart : "https:" + videoUrlPart;
        return [{ url: videoUrl, quality: this._formatQuality(quality, videoUrl), originalUrl: videoUrl, headers: this._getVideoHeaders(url) }];
    }

    async _streamrubyExtractor(url, prefix = "StreamRuby") {
        const res = await this.client.get(url, this.getHeaders(url));
        const script = res.body.substringAfter("sources: [").substringBefore("]");
        if (!script) return [];
        const urls = (script.match(/file:"([^"]+)"/g) || []).map(m => m.replace('file:"', '').replace('"', ''));
        const videoHeaders = this._getVideoHeaders(url);
        let allVideos = [];
        for (const hlsUrl of urls) { if (hlsUrl.includes(".m3u8")) allVideos.push(...await this._parseM3U8(hlsUrl, prefix, videoHeaders)); }
        return allVideos;
    }

    async _upstreamExtractor(url, prefix = "Upstream") {
        const res = await this.client.get(url, this.getHeaders(url));
        const script = res.body.substringAfter("eval(function(p,a,c,k,e,d)").substringBefore("</script>");
        if (!script) return [];
        const unpacked = unpackJs(script);
        const masterUrl = unpacked.match(/hls:\s*['"](https?:\/\/[^'"]+\.m3u8[^'"]*)['"]/)?.[1];
        return masterUrl ? this._parseM3U8(masterUrl, prefix, this._getVideoHeaders(url)) : [];
    }

    async _krakenfilesExtractor(url, quality) {
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);
        const videoUrl = doc.selectFirst("source[src]")?.getSrc;
        return videoUrl ? [{ 
            url: videoUrl, 
            originalUrl: videoUrl, 
            quality: this._formatQuality(quality, videoUrl), 
            headers: this._getVideoHeaders(url) 
        }] : [];
    }

    async _thetubeExtractor(url, prefix) {
        let embedUrl = url;
        if (embedUrl.includes("/e/")) {
            embedUrl = embedUrl.replace("/e/", "/embed-") + ".html";
        }
        
        const res = await this.client.get(embedUrl, this.getHeaders(embedUrl));
        const script = res.body.substringAfter("eval(function(p,a,c,k,e,d)").substringBefore("</script>");
        if (!script) return [];

        const fullScript = "eval(function(p,a,c,k,e,d)" + script;
        const unpacked = unpackJs(fullScript);

        const masterUrl = unpacked.match(/file:\s*['"](https?:\/\/[^'"]+\.m3u8[^'"]*)['"]/)?.[1];
        return masterUrl ? this._parseM3U8(masterUrl, prefix, this._getVideoHeaders(embedUrl)) : [];
    }

    async _bigwarpExtractor(url, prefix) {
        const res = await this.client.get(url, this._getVideoHeaders(url));
        const body = res.body;

        const jwplayerSetup = body.substringAfter('jwplayer("vplayer").setup({').substringBefore('});');
        if (!jwplayerSetup) return [];

        const videos = [];
        const sourceRegex = /{file:"([^"]+)",label:"([^"]+)"}/g;
        const matches = [...jwplayerSetup.matchAll(sourceRegex)];

        for (const match of matches) {
            const videoUrl = match[1];
            const qualityLabel = match[2]; 
            const resolution = qualityLabel.split(' ')[0];
            const finalQuality = `${prefix} - ${resolution}`;

            videos.push({
                url: videoUrl,
                originalUrl: videoUrl,
                quality: this._formatQuality(finalQuality, videoUrl),
                headers: this._getVideoHeaders(url)
            });
        }
        return videos;
    }
    
    async _allinoneExtractor(url, prefix) {
        try {
            const res = await this.client.get(url, this._getVideoHeaders(url));
            const body = res.body;
            const doc = new Document(body);
            const videoHeaders = this._getVideoHeaders(url);
            let sources = [];

            // --- Strategy 1: Direct HTML Tags ---
            const directVideoSrc = doc.selectFirst("source[src]")?.getSrc || doc.selectFirst("video[src]")?.getSrc;
            if (directVideoSrc) {
                sources.push(directVideoSrc);
            }

            // --- Strategy 2: Unpack Obfuscated Scripts & Regex ---
            let potentialScripts = body;
            const packedScriptMatch = body.match(/eval\(function\(p,a,c,k,e,d\)\s?{.*}\)/);
            if (packedScriptMatch) {
                try {
                    const unpacked = unpackJs(packedScriptMatch[0]);
                    if (unpacked) potentialScripts += "\n" + unpacked;
                } catch (e) { /* Unpacking failed, continue */ }
            }

            // Regex for M3U8, MP4, and other video files
            const urlRegex = /(https?:\/\/[^"' \s]+\.(?:m3u8|mp4|webm|mkv|mov|flv|avi))[^"' \s]*/ig;
            let match;
            while ((match = urlRegex.exec(potentialScripts)) !== null) {
                sources.push(match[0]);
            }
            
            // --- Strategy 3: JSON Data in Script Tags ---
            for (const scriptElement of doc.select("script")) {
                const scriptContent = scriptElement.text;
                if (!scriptContent.includes('{') || !scriptContent.includes('}')) continue;

                // Attempt to find and parse JSON-like objects within the script
                const jsonRegex = /[{,\[]\s*["']?(?:file|src|source|url)["']?\s*:\s*["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/ig;
                let jsonMatch;
                while((jsonMatch = jsonRegex.exec(scriptContent)) !== null) {
                    sources.push(jsonMatch[1]);
                }
            }

            // --- Strategy 4: Follow iFrames (Recursive Call) ---
            const iframe = doc.selectFirst("iframe[src]");
            if (iframe) {
                const iframeSrc = iframe.getSrc;
                if (iframeSrc) {
                    // Resolve relative iframe URL
                    const iframeUrl = new URL(iframeSrc, url).href;
                    // Avoid infinite loops and recursion on same domain
                    if (new URL(iframeUrl).hostname !== new URL(url).hostname) {
                         const iframeVideos = await this._allinoneExtractor(iframeUrl, `${prefix} (iFrame)`);
                         if (iframeVideos.length > 0) return iframeVideos;
                    }
                }
            }
            
            // --- Process all found sources ---
            if (sources.length === 0) return [];
            
            // Remove duplicates and invalid entries
            const uniqueSources = [...new Set(sources.filter(s => s && s.startsWith("http")))];

            const allVideos = [];
            for (const sourceUrl of uniqueSources) {
                 if (sourceUrl.includes(".m3u8")) {
                    allVideos.push(...await this._parseM3U8(sourceUrl, prefix, videoHeaders));
                } else {
                    allVideos.push({
                        url: sourceUrl,
                        originalUrl: sourceUrl,
                        quality: this._formatQuality(prefix, sourceUrl),
                        headers: videoHeaders
                    });
                }
            }
            return allVideos;

        } catch (e) {
            return []; // Return empty on any catastrophic error
        }
    }

    getFilterList() {
        const categories = [{"name": "اختر", "query": ""}, {"name": "كل الافلام", "query": "/movies/"}, {"name": "افلام اجنبى", "query": "/category/افلام-اجنبي-3/"}, {"name": "افلام انمى", "query": "/category/افلام-انمي-1/"}, {"name": "افلام اسيويه", "query": "/category/افلام-اسيوي/"}, {"name": "افلام نتفليكس", "query": "/netflix-movies/"}, {"name": "سلاسل الافلام", "query": "/movies/"}, {"name": "الاعلي تقييما", "query": "/top-rating-imdb/"}, {"name": "مسلسلات اجنبى", "query": "/category/مسلسلات-اجنبي/"}, {"name": "مسلسلات اجنبى نتفليكس", "query": "/netflix-series/?cat=7"}, {"name": "مسلسلات اسيوية", "query": "/category/مسلسلات-اسيوية-7/"}, {"name": "مسلسلات اسيوية نتفليكس", "query": "/netflix-series/?cat=9"}, {"name": "مسلسلات انمي", "query": "/category/مسلسلات-انمي-1/"}, {"name": "مسلسلات انمي نتفلكس", "query": "/netflix-series/?cat=8"}, {"name": "احدث حلقات الانمي", "query": "/category/مسلسلات-انمي-1/?key=episodes"}];
        return [{type_name: "SelectFilter", name: "الأقسام", state: 0, values: categories.map(c => ({type_name: "SelectOption", name: c.name, value: c.query}))}];
    }

    getSourcePreferences() {
        const serverEntries = [
            "Doodstream", "StreamWish", "Filemoon", "Mp4upload", "Voe.sx", "Streamtape", "LuluStream", "Uqload", "Mixdrop",
            "VidTube", "UpDown", "FileLions",
            "Ok.ru", "Vidmoly", "MegaMax", "VK", "Videa", "Dailymotion", "Sendvid", "VidGuard/Mivalyo", 
            "StreamRuby", "Upstream/Veev", "Mega.nz (WebView only)"
        ];
        const serverEntryValues = [
            "dood", "wish", "filemoon", "mp4upload", "voe", "tape", "lulu", "uqload", "mixdrop",
            "vidtube", "updown", "filelions",
            "okru", "vidmoly", "megamax", "vk", "videa", "dailymotion", "sendvid", "vidguard",
            "ruby", "upstream", "mega"
        ];
        const megamaxDriverEntries = [
            "Mp4upload", "DoodStream", "Ok.ru", "Voe.sx", "Vidmoly", "Uqload", "VK", "Videa",
            "Dailymotion", "Sendvid", "StreamTape", "StreamWish", "Filemoon", "VidGuard",
            "Darkibox", "Hexupload", "BigWarp", "VidBom", "Lulustream", "MixDrop", "StreamRuby",
            "Upstream/Veev", "KrakenFiles", "TheTube", "VidHide"
        ];
        const megamaxDriverEntryValues = [
            "mp4upload", "doodstream", "okru", "voe", "vidmoly", "uqload", "vk", "videa",
            "dailymotion", "sendvid", "streamtape", "streamwish", "filemoon", "vidguard",
            "darkibox", "hexupload", "bigwarp", "vidbam", "lulustream", "mixdrop", "streamruby",
            "veev", "krakenfiles", "thetube", "vidhide"
        ];
        return [{
            key: "override_base_url",
            editTextPreference: {
                title: "تجاوز عنوان URL الأساسي",
                summary: "استخدم دومين مختلف للمصدر",
                value: this.source.baseUrl,
                dialogTitle: "أدخل عنوان URL الأساسي الجديد",
                dialogMessage: "الإفتراضي: " + this.source.baseUrl,
            }
        }, {
            key: "preferred_quality",
            listPreference: {
                title: "الجودة المفضلة",
                summary: "اختر الجودة التي سيتم اختيارها تلقائيا",
                valueIndex: 0,
                entries: ["1080p", "720p", "480p", "360p"],
                entryValues: ["1080", "720", "480", "360"],
            }
        }, {
            key: "hoster_selection",
            multiSelectListPreference: {
                title: "اختر السيرفرات",
                summary: "اختر السيرفرات التي تريد ان تظهر",
                entries: serverEntries,
                entryValues: serverEntryValues,
                values: ["dood", "wish", "filemoon", "mp4upload", "voe", "tape", "vidtube", "updown"],
            }
        }, {
            key: "megamax_driver_selection",
            multiSelectListPreference: {
                title: "اختر سيرفرات MegaMax الداخلية",
                summary: "يعمل فقط عند تفعيل سيرفر MegaMax. اختر السيرفرات التي سيتم استخراجها.",
                entries: megamaxDriverEntries,
                entryValues: megamaxDriverEntryValues,
                values: megamaxDriverEntryValues,
            }
        }, {
            key: "extract_qualities",
            switchPreferenceCompat: {
                title: "استخراج الجودات المتعددة (HLS)",
                summary: "عند تفعيله سيقوم بجلب جميع الجودات المتاحة من السيرفرات الداعمة",
                value: false, 
            }
        }, {
            key: "show_video_url_in_quality",
            switchPreferenceCompat: {
                title: "إظهار رابط الفيديو",
                summary: "عرض رابط الفيديو النهائي بجانب اسم الجودة",
                value: false,
            }
        }, {
            key: "show_embed_url_in_quality",
            switchPreferenceCompat: {
                title: "إظهار رابط التضمين (للتصحيح)",
                summary: "عرض رابط التضمين الأولي بجانب اسم الجودة (لأغراض التصحيح)",
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

// Robust unpacker function based on the provided Kotlin example
function unpackJs(packedJS) {
    try {
        const match = packedJS.match(/}\s*\('(.*)',\s*(\d+),\s*(\d+),\s*'(.*?)'\.split\('\|'\)/);
        if (!match) {
             const oldMatch = packedJS.match(/eval\(function\(p,a,c,k,e,d\){.*}\((.*)\)\)/);
             if (oldMatch) {
                let args = oldMatch[1].split(',').map(arg => arg.trim());
                let p = args[0].replace(/^'|'$/g, '');
                let a = parseInt(args[1]);
                let c = parseInt(args[2]);
                let k = args[3].replace(/^'|'$/g, '').split('|');
                
                while (c--) {
                    if (k[c]) {
                        p = p.replace(new RegExp('\\b' + c.toString(a) + '\\b', 'g'), k[c]);
                    }
                }
                return p;
             }
             return packedJS;
        }

        let payload = match[1].replace(/\\'/g, "'");
        const radix = parseInt(match[2]);
        let count = parseInt(match[3]);
        const symtab = match[4].split('|');

        if (symtab.length !== count) return packedJS; // Sanity check

        const unbase = (str) => {
            const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
            if (radix > 36) {
                let ret = 0;
                const strRev = str.split('').reverse().join('');
                for (let i = 0; i < strRev.length; i++) {
                    const charIndex = ALPHABET.indexOf(strRev[i]);
                    if (charIndex === -1) return NaN;
                    ret += charIndex * Math.pow(radix, i);
                }
                return ret;
            } else {
                return parseInt(str, radix);
            }
        };

        return payload.replace(/\b\w+\b/g, (word) => {
            const index = unbase(word);
            return (index < count && symtab[index] && symtab[index] !== "") ? symtab[index] : word;
        });
    } catch (e) {
        return packedJS; // Return original on error
    }
}

new DefaultExtension();
