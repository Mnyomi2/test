// --- METADATA ---
const mangayomiSources = [{
    "name": "Anime4up",
    "id": 8374956845,
    "lang": "ar",
    "baseUrl": "https://ww.anime4up.rest",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=ww.anime4up.rest",
    "typeSource": "single",
    "itemType": 1,
    "version": "1.5.5",
    "pkgPath": "anime/src/ar/anime4up.js"
}];

// --- CLASS ---
class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    // --- PREFERENCES AND HEADERS ---

    getPreference(key) {
        return new SharedPreferences().get(key);
    }

    getBaseUrl() {
        return this.getPreference("override_base_url") || this.source.baseUrl;
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
        if (refererUrl.includes("vidmoly")) {
             headers["Origin"] = "https://vidmoly.net";
        }
        return headers;
    }


    // --- HELPER METHODS ---

    async fetchAndParseCataloguePage(path) {
        const url = this.getBaseUrl() + path;
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);
        const list = [];
        for (const item of doc.select(".anime-card-container, div.row.posts-row article")) {
            const linkElement = item.selectFirst("div.anime-card-title h3 a, h3.post-title a");
            const imageElement = item.selectFirst("img.img-responsive");
            if (linkElement && imageElement) {
                list.push({
                    name: linkElement.text.trim(),
                    link: linkElement.getHref.replace(/^https?:\/\/[^\/]+/, ''),
                    imageUrl: imageElement.getSrc
                });
            }
        }
        const hasNextPage = doc.selectFirst("ul.pagination li a[href*='page='], a.next.page-numbers") != null;
        return { list, hasNextPage };
    }

    getNumericQuality(quality) {
        const q = quality.toLowerCase();
        if (q.includes("fhd") || q.includes("1080")) return "1080p";
        if (q.includes("hd") || q.includes("720")) return "720p";
        if (q.includes("sd") || q.includes("480")) return "480p";
        return "720p"; // Default quality
    }
    
    _formatQuality(baseQuality, url) {
        if (this.getPreference("show_video_url_in_quality")) {
            return `${baseQuality} - ${url}`;
        }
        return baseQuality;
    }

    // --- CORE METHODS ---

    async getPopular(page) {
        return this.fetchAndParseCataloguePage(`/قائمة-الانمي/page/${page}/`);
    }

    async getLatestUpdates(page) {
        const { list, hasNextPage } = await this.fetchAndParseCataloguePage(`/episode/page/${page}/`);
        const fixedList = list.map(item => ({
            ...item,
            link: item.link.replace(/-%d8%a7%d9%84%d8%ح%d9%84%d9%82%d8%a9-.*$/, "").replace("/episode/", "/anime/")
        }));
        return { list: fixedList, hasNextPage };
    }

    async search(query, page, filters) {
        let urlPath;
        if (query) {
            urlPath = `/?search_param=animes&s=${encodeURIComponent(query)}&paged=${page}`;
        } else {
            const findFilter = (name) => filters.find(f => f.name === name);
            const getFilterValue = (filter) => filter && filter.state > 0 ? filter.values[filter.state].value : null;
            const section = getFilterValue(findFilter("القسم"));
            const genre = getFilterValue(findFilter("تصنيف الأنمي"));
            const status = getFilterValue(findFilter("حالة الأنمي"));
            const type = getFilterValue(findFilter("النوع"));
            const season = getFilterValue(findFilter("الموسم"));
            let basePath = "";
            if (section) basePath = `/anime-category/${section}/`;
            else if (genre) basePath = `/anime-genre/${genre}/`;
            else if (status) basePath = `/anime-status/${status}/`;
            else if (type) basePath = `/anime-type/${type}/`;
            else if (season) basePath = `/anime-season/${season}/`;
            urlPath = basePath ? `${basePath}?page=${page}` : `/قائمة-الانمي/page/${page}/`;
        }
        return this.fetchAndParseCataloguePage(urlPath);
    }

    async getDetail(url) {
        const res = await this.client.get(this.getBaseUrl() + url, this.getHeaders(this.getBaseUrl() + url));
        const doc = new Document(res.body);
        const name = doc.selectFirst("h1.anime-details-title").text;
        const imageUrl = doc.selectFirst("div.anime-thumbnail img.thumbnail").getSrc;
        const description = doc.selectFirst("p.anime-story").text;
        const statusText = doc.selectFirst("div.anime-info:contains(حالة الأنمي) a")?.text ?? '';
        const status = { "يعرض الان": 0, "مكتمل": 1 }[statusText] ?? 5;
        const genre = doc.select("ul.anime-genres > li > a").map(e => e.text);
        const chapters = doc.select(".episodes-card-title h3 a").map(element => ({
            name: element.text.trim(),
            url: element.getHref.replace(/^https?:\/\/[^\/]+/, '')
        })).reverse();
        return { name, imageUrl, description, link: url, status, genre, chapters };
    }

    // --- VIDEO EXTRACTION ---

    async getVideoList(url) {
        const res = await this.client.get(this.getBaseUrl() + url, this.getHeaders(this.getBaseUrl() + url));
        const doc = new Document(res.body);
        const hosterSelection = this.getPreference("hoster_selection") || [];
        const showEmbedUrl = this.getPreference("show_embed_url_in_quality");
        const videos = [];

        const extractorMap = [
            { key: 'mp4upload',  domains: ['mp4upload'],      func: this._mp4uploadExtractor,  useQuality: true },
            { key: 'dood',       domains: ['dood', 'd-s.io'], func: this._doodExtractor,       useQuality: true },
            { key: 'okru',       domains: ['ok.ru'],          func: this._okruExtractor,       useQuality: false },
            { key: 'voe',        domains: ['voe.sx'],         func: this._voeExtractor,        useQuality: false },
            { key: 'vidmoly',    domains: ['vidmoly'],        func: this._vidmolyExtractor,     useQuality: false },
            { key: 'uqload',     domains: ['uqload'],         func: this._uqloadExtractor,     useQuality: true },
            { key: 'megamax',    domains: ['megamax'],        func: this._megamaxExtractor,    useQuality: false },
            { key: 'vk',         domains: ['vk.com', 'vkvideo.ru'], func: this._vkExtractor,   useQuality: false },
            { key: 'videa',      domains: ['videa.hu'],       func: this._videaExtractor,      useQuality: true },
            { key: 'dailymotion',domains: ['dailymotion'],    func: this._dailymotionExtractor,useQuality: false },
            { key: 'sendvid',    domains: ['sendvid'],        func: this._sendvidExtractor,    useQuality: true },
            { key: 'streamtape', domains: ['streamtape'],     func: this._streamtapeExtractor, useQuality: true },
            { key: 'streamwish', domains: ['streamwish', 'filelions', 'streamvid', 'wolfstream', 'embedsito'], func: this._streamwishExtractor, useQuality: false },
            { key: 'vidbom',     domains: ['vidbom', 'vidbam', 'vbshar'], func: this._vidbomExtractor, useQuality: false },
            { key: 'filemoon',   domains: ['filemoon'],       func: this._filemoonExtractor,   useQuality: false },
            { key: 'lulustream', domains: ['luluvid', 'luluvdo'], func: this._lulustreamExtractor, useQuality: false },
            { key: 'mixdrop',    domains: ['mixdrop', 'mxdrop'], func: this._mixdropExtractor,  useQuality: true },
            { key: 'streamruby', domains: ['streamruby', 'rubyvid'], func: this._streamrubyExtractor, useQuality: false },
            { key: 'upstream',   domains: ['upstream'],       func: this._upstreamExtractor,   useQuality: false },
        ];

        for (const element of doc.select('#episode-servers li a')) {
            let streamUrl = null;
            let qualityPrefix = null;
            try {
                streamUrl = element.attr('data-ep-url');
                if (!streamUrl) continue;
                streamUrl = streamUrl.replace(/&amp;/g, '&');
                if (streamUrl.startsWith("//")) streamUrl = "https:" + streamUrl;
                if (streamUrl.includes("vidmoly.to")) streamUrl = streamUrl.replace("vidmoly.to", "vidmoly.net");

                const streamUrlLower = streamUrl.toLowerCase();
                const qualityText = element.text.trim();
                
                const extractor = extractorMap.find(ext =>
                    hosterSelection.includes(ext.key) && ext.domains.some(d => streamUrlLower.includes(d))
                );

                const numericQuality = this.getNumericQuality(qualityText);
                const serverNameText = qualityText.split(' - ')[0].trim();
                qualityPrefix = `${serverNameText} - ${numericQuality}`;
                if (showEmbedUrl) {
                    qualityPrefix += ` [${streamUrl}]`;
                }

                if (extractor) {
                    const prefixForExtractor = extractor.useQuality ? qualityPrefix : serverNameText;
                    const extractedVideos = await extractor.func.call(this, streamUrl, prefixForExtractor);
                    if (extractedVideos && extractedVideos.length > 0) {
                        videos.push(...extractedVideos);
                    } else {
                        throw new Error("Extractor returned no videos.");
                    }
                } else if (hosterSelection.includes("mega") && streamUrlLower.includes("mega.nz")) {
                    videos.push({ url: streamUrl, quality: qualityPrefix, headers: this._getVideoHeaders(streamUrl) });
                }
            } catch (e) {
                if (showEmbedUrl && streamUrl && qualityPrefix) {
                    videos.push({
                        url: "",
                        originalUrl: streamUrl,
                        quality: `[Failed] ${qualityPrefix}`,
                        headers: {}
                    });
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

    async _mp4uploadExtractor(url, quality) {
        const embedHtml = (await this.client.get(url, this._getVideoHeaders(url))).body;
        const sourceMatch = embedHtml.match(/player\.src\({[^}]+src:\s*"([^"]+)"/);
        return sourceMatch ? [{ url: sourceMatch[1], originalUrl: sourceMatch[1], quality: this._formatQuality(quality, sourceMatch[1]), headers: { "Referer": url } }] : [];
    }

    async _doodExtractor(url, quality) {
        const res = await this.client.get(url, this._getVideoHeaders(url));
        const passMd5 = res.body.substringAfter("/pass_md5/").substringBefore("'");
        const doodApi = `https://${new URL(url).hostname}/pass_md5/${passMd5}`;
        const videoUrl = (await this.client.get(doodApi, this._getVideoHeaders(url))).body;
        const randomString = Math.random().toString(36).substring(7);
        const finalUrl = `${videoUrl}${randomString}?token=${passMd5.substring(passMd5.lastIndexOf('/') + 1)}`;
        return [{ url: finalUrl, quality: this._formatQuality(quality, finalUrl), originalUrl: finalUrl, headers: this._getVideoHeaders(url) }];
    }

    async _voeExtractor(url) {
        const res = await this.client.get(url, this._getVideoHeaders(url));
        const hlsUrl = res.body.substringAfter("'hls': '").substringBefore("'");
        return hlsUrl ? this._parseM3U8(hlsUrl, "Voe.sx") : [];
    }

    async _okruExtractor(url, prefix = "Okru") {
        // Standardize the URL to always use the embed format, which contains the required data.
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
            const getQualityName = (name) => {
                switch (name) {
                    case "full": return "1080p";
                    case "hd": return "720p";
                    case "sd": return "480p";
                    case "low": return "360p";
                    case "lowest": return "240p";
                    case "mobile": return "144p";
                    default: return name;
                }
            };
            
            if (metadata.videos) {
                videos.push(...metadata.videos.map(video => {
                    const quality = getQualityName(video.name);
                    return {
                        url: video.url,
                        originalUrl: video.url,
                        quality: this._formatQuality(`${prefix} ${quality}`, video.url),
                        headers: videoHeaders
                    };
                }));
            }

            if (metadata.hlsManifestUrl) {
                videos.unshift({
                    url: metadata.hlsManifestUrl,
                    originalUrl: metadata.hlsManifestUrl,
                    quality: this._formatQuality(`${prefix} Auto (HLS)`, metadata.hlsManifestUrl),
                    headers: videoHeaders
                });
            }

            if (videos.length > 1) {
                const autoOption = videos.shift();
                videos.reverse();
                videos.unshift(autoOption);
            }
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
        const res = await this.client.get(url, this.getHeaders(url));
        let script = res.body.substringAfter("eval(function(p,a,c,k,e,d)").substringBefore("</script>");
        if (!script) return [];
        script = "eval(function(p,a,c,k,e,d)" + script;
        const unpacked = unpackJs(script);
        const masterUrl = unpacked.match(/file:"(https[^"]+m3u8)"/)?.[1];
        return masterUrl ? this._parseM3U8(masterUrl, prefix, this._getVideoHeaders(url)) : [];
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
        try {
            const pageRes = await this.client.get(url, this._getVideoHeaders(url));
            const videoIdMatch = pageRes.body.match(/<link rel="canonical" href="[^"]+\/video\/([^"]+)"/);
            const videoId = videoIdMatch?.[1];

            if (!videoId) {
                return [];
            }
            const metadataUrl = `https://www.dailymotion.com/player/metadata/video/${videoId}`;
            const metadataHeaders = this._getVideoHeaders(url);
            const metadataRes = await this.client.get(metadataUrl, metadataHeaders);
            const metadata = JSON.parse(metadataRes.body);
            const masterUrl = metadata?.qualities?.auto?.[0]?.url;

            if (masterUrl && masterUrl.includes(".m3u8")) {
                return this._parseM3U8(masterUrl, prefix, this._getVideoHeaders(url));
            } else {
                return [];
            }
        } catch (error) {
            return [];
        }
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
        const videoUrlPart1 = script.substringAfter("innerHTML = '").substringBefore("'");
        const videoUrlPart2 = script.substringAfter("+ ('xcd").substringBefore("'");
        const finalUrl = "https:" + videoUrlPart1 + videoUrlPart2;
        return [{ url: finalUrl, quality: this._formatQuality(quality, finalUrl), originalUrl: finalUrl, headers: this._getVideoHeaders(url) }];
    }
    
    async _streamwishExtractor(url, prefix = "StreamWish") {
        const res = await this.client.get(url, this.getHeaders(url));
        let script = res.body.substringAfter("eval(function(p,a,c,k,e,d)").substringBefore("</script>");
        if (!script) return [];
        script = "eval(function(p,a,c,k,e,d)" + script;
        const unpacked = unpackJs(script);
        const masterUrl = unpacked.match(/(https?:\/\/[^"]+\.m3u8[^"]*)/)?.[1];
        return masterUrl ? this._parseM3U8(masterUrl, prefix, this._getVideoHeaders(url)) : [];
    }
    
    async _vidbomExtractor(url) {
        const res = await this.client.get(url, this.getHeaders(url));
        const script = res.body.substringAfter("sources: [").substringBefore("]");
        if (!script) return [];
        const videoHeaders = this._getVideoHeaders(url);
        const sources = script.split('{file:"').slice(1);
        let allVideos = [];
        for (const source of sources) {
            const src = source.substringBefore('"');
            if (src.includes(".m3u8")) {
                allVideos.push(...await this._parseM3U8(src, "VidShare", videoHeaders));
            } else {
                const qualityLabel = "VidShare: " + source.substringAfter('label:"').substringBefore('"');
                allVideos.push({ url: src, originalUrl: src, quality: this._formatQuality(qualityLabel, src), headers: videoHeaders });
            }
        }
        return allVideos;
    }
    
    async _filemoonExtractor(url, prefix = "Filemoon") {
        const videoHeaders = { ...this._getVideoHeaders(url), "Origin": `https://${new URL(url).hostname}` };
        const res = await this.client.get(url, videoHeaders);
        const jsEval = res.body.substringAfter("eval(function(p,a,c,k,e,d)").substringBefore("</script>");
        if (!jsEval) return [];
        const unpacked = unpackJs("eval(function(p,a,c,k,e,d)" + jsEval);
        const masterUrl = unpacked.match(/file:"([^"]+)"/)?.[1];
        return masterUrl ? this._parseM3U8(masterUrl, prefix, videoHeaders) : [];
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
        let script = res.body.substringAfter("eval(function(p,a,c,k,e,d)").substringBefore("</script>");
        if (!script) return [];
        script = "eval(function(p,a,c,k,e,d)" + script;
        const unpacked = unpackJs(script);
        const videoUrl = "https:" + unpacked.match(/MDCore\.wurl="([^"]+)"/)?.[1];
        return videoUrl ? [{ url: videoUrl, quality: this._formatQuality(quality, videoUrl), originalUrl: videoUrl, headers: this._getVideoHeaders(url) }] : [];
    }

    async _streamrubyExtractor(url, prefix = "StreamRuby") {
        const res = await this.client.get(url, this.getHeaders(url));
        const script = res.body.substringAfter("sources: [").substringBefore("]");
        if (!script) return [];
        const urls = (script.match(/file:"([^"]+)"/g) || []).map(m => m.replace('file:"', '').replace('"', ''));
        const videoHeaders = this._getVideoHeaders(url);
        let allVideos = [];
        for (const hlsUrl of urls) {
            if (hlsUrl.includes(".m3u8")) {
                allVideos.push(...await this._parseM3U8(hlsUrl, prefix, videoHeaders));
            }
        }
        return allVideos;
    }

    async _upstreamExtractor(url, prefix = "Upstream") {
        const res = await this.client.get(url, this.getHeaders(url));
        let script = res.body.substringAfter("eval(function(p,a,c,k,e,d)").substringBefore("</script>");
        if (!script) return [];
        script = "eval(function(p,a,c,k,e,d)" + script;
        const unpacked = unpackJs(script);
        const masterUrl = unpacked.match(/hls:\s*"([^"]+)"/)?.[1];
        return masterUrl ? this._parseM3U8(masterUrl, prefix, this._getVideoHeaders(url)) : [];
    }


    // --- FILTERS AND PREFERENCES ---

    getFilterList() {
        // ... (Filter code remains unchanged)
        const getSlug = (href) => href.split('/').filter(Boolean).pop();const sections=[{name:'الكل',value:''},{name:'الانمي المترجم',value:getSlug('https://ww.anime4up.rest/anime-category/%d8%a7%d9%84%d8%a7%d9%86%d9%85%d9%8a-%d8%a7%d9%84%d9%85%d8%aa%d8%b1%d8%ac%d9%85/')},{name:'الانمي المدبلج',value:getSlug('https://ww.anime4up.rest/anime-category/%d8%a7%d9%84%d8%a7%d9%86%d9%85%d9%8a-%d8%a7%d9%84%d9%85%d8%af%d8%a8%d9%84%d8%ac/')}].map(s=>({type_name:"SelectOption",name:s.name,value:s.value}));const genres=[{name:'الكل',value:''},{name:'أطفال',value:'أطفال'},{name:'أكشن',value:'أكشن'},{name:'إيتشي',value:'إيتشي'},{name:'اثارة',value:'اثارة'},{name:'الحياة العملية',value:'الحياة-العملية'},{name:'العاب',value:'العاب'},{name:'بوليسي',value:'بوليسي'},{name:'تاريخي',value:'تاريخي'},{name:'جنون',value:'جنون'},{name:'جوسي',value:'جوسي'},{name:'حربي',value:'حربي'},{name:'حريم',value:'حريم'},{name:'خارق للعادة',value:'خارق-للعادة'},{name:'خيال علمي',value:'خيال-علمي'},{name:'دراما',value:'دراما'},{name:'رعب',value:'رعب'},{name:'رومانسي',value:'رومانسي'},{name:'رياضي',value:'رياضي'},{name:'ساموراي',value:'ساموراي'},{name:'سباق',value:'سباق'},{name:'سحر',value:'سحر'},{name:'سينين',value:'سينين'},{name:'شريحة من الحياة',value:'شريحة-من-الحياة'},{name:'شوجو',value:'شوجو'},{name:'شوجو اَي',value:'شوجو-اَي'},{name:'شونين',value:'شونين'},{name:'شونين اي',value:'شونين-اي'},{name:'شياطين',value:'شياطين'},{name:'طبي',value:'طبي'},{name:'غموض',value:'غموض'},{name:'فضائي',value:'فضائي'},{name:'فنتازيا',value:'فنتازيا'},{name:'فنون تعبيرية',value:'فنون-تعبيرية'},{name:'فنون قتالية',value:'فنون-قتالية'},{name:'قوى خارقة',value:'قوى- خارقة'},{name:'كوميدي',value:'كوميدي'},{name:'مأكولات',value:'مأكولات'},{name:'محاكاة ساخرة',value:'محاكاة-ساخرة'},{name:'مدرسي',value:'مدرسي'},{name:'مصاصي دماء',value:'مصاصي-دماء'},{name:'مغامرات',value:'مغامرات'},{name:'موسيقي',value:'موسيقي'},{name:'ميكا',value:'ميكا'},{name:'نفسي',value:'نفسي'},].map(g=>({type_name:"SelectOption",name:g.name,value:encodeURIComponent(g.value)}));const statuses=[{name:'الكل',value:''},{name:'لم يعرض بعد',value:getSlug('https://ww.anime4up.rest/anime-status/%d9%84%d9%85-%d9%8a%d8%b9%d8%b1%d8%b6-%d8%a8%d8%b9%d8%af/')},{name:'مكتمل',value:'complete'},{name:'يعرض الان',value:getSlug('https://ww.anime4up.rest/anime-status/%d9%8a%d8%b9%d8%b1%d8%b6-%d8%a7%d9%84%d8%a7%d9%86-1/')}].map(s=>({type_name:"SelectOption",name:s.name,value:s.value}));const types=[{name:'الكل',value:''},{name:'Movie',value:'movie-3'},{name:'ONA',value:'ona1'},{name:'OVA',value:'ova1'},{name:'Special',value:'special1'},{name:'TV',value:'tv2'}].map(t=>({type_name:"SelectOption",name:t.name,value:t.value}));const seasons=[{name:'الكل',value:'',sortKey:'9999'}];const currentYear=new Date().getFullYear();const seasonMap={'spring':'ربيع','summer':'صيف','fall':'خريف','winter':'شتاء'};for(let year=currentYear+2;year>=2000;year--){Object.entries(seasonMap).forEach(([eng,arb],index)=>{const seasonSlug=`${arb}-${year}`;seasons.push({name:`${arb} ${year}`,value:encodeURIComponent(seasonSlug),sortKey:`${year}-${4-index}`});});}
        const seasonOptions=seasons.sort((a,b)=>b.sortKey.localeCompare(a.sortKey)).map(s=>({type_name:"SelectOption",name:s.name,value:s.value}));return[{type_name:"HeaderFilter",name:"ملاحظة: سيتم تجاهل الفلاتر في حال البحث بالاسم."},{type_name:"SelectFilter",name:"القسم",state:0,values:sections},{type_name:"SelectFilter",name:"تصنيف الأنمي",state:0,values:genres},{type_name:"SelectFilter",name:"حالة الأنمي",state:0,values:statuses},{type_name:"SelectFilter",name:"النوع",state:0,values:types},{type_name:"SelectFilter",name:"الموسم",state:0,values:seasonOptions},];
    }

    getSourcePreferences() {
        const serverEntries = [
            "DoodStream", "Voe.sx", "Mp4upload", "Ok.ru", "Vidmoly", "Uqload", 
            "MegaMax", "VK", "Videa", "Dailymotion", "Sendvid", "StreamTape", 
            "StreamWish & Variants", "VidBom/VidShare", "Filemoon", "Lulustream", 
            "MixDrop", "StreamRuby", "Upstream", "Mega.nz (WebView only)"
        ];
        const serverEntryValues = [
            "dood", "voe", "mp4upload", "okru", "vidmoly", "uqload", 
            "megamax", "vk", "videa", "dailymotion", "sendvid", "streamtape",
            "streamwish", "vidbom", "filemoon", "lulustream", 
            "mixdrop", "streamruby", "upstream", "mega"
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
                valueIndex: 1,
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
                values: serverEntryValues,
            }
        }, {
            key: "extract_qualities",
            switchPreferenceCompat: {
                title: "استخراج الجودات المتعددة (HLS)",
                summary: "عند تفعيله، سيقوم بجلب جميع الجودات المتاحة من السيرفرات الداعمة.",
                value: true, 
            }
        }, {
            key: "show_video_url_in_quality",
            switchPreferenceCompat: {
                title: "إظهار رابط الفيديو",
                summary: "عرض رابط الفيديو النهائي بجانب اسم الجودة.",
                value: false,
            }
        }, {
            key: "show_embed_url_in_quality",
            switchPreferenceCompat: {
                title: "إظهار رابط التضمين (للتصحيح)",
                summary: "عرض رابط التضمين الأولي بجانب اسم الجودة (لأغراض التصحيح).",
                value: false,
            }
        }];
    }
}

// unpacker function for some extractors
function unpackJs(p, a, c, k, e, d) { while (c--) { if (k[c]) { p = p.replace(new RegExp('\\b' + c.toString(a) + '\\b', 'g'), k[c]) } } return p }
