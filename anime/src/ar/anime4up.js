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
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
        };
    }
    
    _getVideoHeaders(refererUrl) {
        const headers = this.getHeaders(refererUrl);
        headers["Referer"] = refererUrl;
        try {
            const urlHost = new URL(refererUrl).hostname;
            if (urlHost.includes("ok.ru")) headers["Origin"] = "https://ok.ru";
            if (urlHost.includes("vk.com")) headers["Origin"] = "https://vk.com";
        } catch (e) { /* Invalid URL, proceed with default headers */ }
        return headers;
    }
    
    _formatQuality(baseQuality, url) {
        if (this.getPreference("show_video_url_in_quality")) {
            return `${baseQuality} - ${url}`;
        }
        return baseQuality;
    }

    // --- HELPER METHODS ---

    async fetchAndParseCataloguePage(path) {
        const url = this.getBaseUrl() + path;
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);
        const list = [];
        const items = doc.select(".anime-card-container, div.row.posts-row article");
        for (const item of items) {
            const linkElement = item.selectFirst("div.anime-card-title h3 a, h3.post-title a");
            const imageElement = item.selectFirst("img.img-responsive");
            if (linkElement && imageElement) {
                const name = linkElement.text.trim();
                const link = linkElement.getHref.replace(/^https?:\/\/[^\/]+/, '');
                const imageUrl = imageElement.getSrc;
                list.push({ name, imageUrl, link });
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
        return "720p";
    }

    // --- CORE METHODS --- (Popular, Latest, Search, Detail are unchanged)

    async getPopular(page) { return this.fetchAndParseCataloguePage(`/قائمة-الانمي/page/${page}/`); }
    async getLatestUpdates(page) { const result = await this.fetchAndParseCataloguePage(`/episode/page/${page}/`); const fixedList = result.list.map(item => ({ ...item, link: item.link.replace(/-%d8%a7%d9%84%d8%ح%d9%84%d9%82%d8%a9-.*$/, "").replace("/episode/", "/anime/") })); return { list: fixedList, hasNextPage: result.hasNextPage }; }
    async search(query, page, filters) { let urlPath; if (query) { urlPath = `/?search_param=animes&s=${encodeURIComponent(query)}&paged=${page}`; } else { const findFilter = (name) => filters.find(f => f.name === name); const sectionFilter = findFilter("القسم"), genreFilter = findFilter("تصنيف الأنمي"), statusFilter = findFilter("حالة الأنمي"), typeFilter = findFilter("النوع"), seasonFilter = findFilter("الموسم"); let basePath = ""; if (sectionFilter?.state > 0) basePath = `/anime-category/${sectionFilter.values[sectionFilter.state].value}/`; else if (genreFilter?.state > 0) basePath = `/anime-genre/${genreFilter.values[genreFilter.state].value}/`; else if (statusFilter?.state > 0) basePath = `/anime-status/${statusFilter.values[statusFilter.state].value}/`; else if (typeFilter?.state > 0) basePath = `/anime-type/${typeFilter.values[typeFilter.state].value}/`; else if (seasonFilter?.state > 0) basePath = `/anime-season/${seasonFilter.values[seasonFilter.state].value}/`; urlPath = basePath ? `${basePath}?page=${page}` : `/قائمة-الانمي/page/${page}/`; } return this.fetchAndParseCataloguePage(urlPath); }
    async getDetail(url) { const res = await this.client.get(this.getBaseUrl() + url, this.getHeaders(this.getBaseUrl() + url)); const doc = new Document(res.body); const name = doc.selectFirst("h1.anime-details-title").text; const imageUrl = doc.selectFirst("div.anime-thumbnail img.thumbnail").getSrc; const description = doc.selectFirst("p.anime-story").text; const statusText = doc.selectFirst("div.anime-info:contains(حالة الأنمي) a")?.text ?? ''; const status = { "يعرض الان": 0, "مكتمل": 1 }[statusText] ?? 5; const genre = doc.select("ul.anime-genres > li > a").map(e => e.text); const chapters = doc.select(".episodes-card-title h3 a").map(element => ({ name: element.text.trim(), url: element.getHref.replace(/^https?:\/\/[^\/]+/, '') })).reverse(); return { name, imageUrl, description, link: url, status, genre, chapters }; }

    // --- VIDEO EXTRACTION ---

    async getVideoList(url) {
        const res = await this.client.get(this.getBaseUrl() + url, this.getHeaders(this.getBaseUrl() + url));
        const doc = new Document(res.body);
        let videos = [];
        const hosterSelection = this.getPreference("hoster_selection") || [];

        const extractorMap = {
            "Mp4upload": { domains: ["mp4upload"], func: (u, q) => this._mp4uploadExtractor(u, `Mp4upload - ${q}`) },
            "Dood": { domains: ["dood", "d-s.io"], func: (u, q) => this._doodExtractor(u, `DoodStream - ${q}`) },
            "Okru": { domains: ["ok.ru", "odnoklassniki"], func: (u, _) => this._okruExtractor(u, "Ok.ru") },
            "Voe": { domains: ["voe.sx"], func: (u, q) => this._voeExtractor(u, `Voe.sx - ${q}`) },
            "Vidmoly": { domains: ["vidmoly"], func: (u, q) => this._vidmolyExtractor(u, `Vidmoly - ${q}`) },
            "Uqload": { domains: ["uqload"], func: (u, q) => this._uqloadExtractor(u, `Uqload - ${q}`) },
            "MegaMax": { domains: ["megamax"], func: (u, q) => this._megamaxExtractor(u, `MegaMax - ${q}`) },
            "VK": { domains: ["vk.com", "vkvideo.ru"], func: (u, _) => this._vkExtractor(u, "VK") },
            "Videa": { domains: ["videa.hu"], func: (u, q) => this._videaExtractor(u, `Videa - ${q}`) },
            "Streamtape": { domains: ["streamtape"], func: (u, q) => this._streamtapeExtractor(u, `Streamtape - ${q}`) },
            "StreamWish": { domains: ["streamwish", "filelions", "streamvid", "wolfstream"], func: (u, q) => this._streamwishExtractor(u, `StreamWish - ${q}`) },
            "Vidbom": { domains: ["vidbom", "vidbam"], func: (u, _) => this._vidbomExtractor(u) },
            "Yodbox": { domains: ["youdbox", "yodbox"], func: (u, _) => this._yodboxExtractor(u) },
            "Filemoon": { domains: ["filemoon"], func: (u, q) => this._filemoonExtractor(u, `Filemoon - ${q}`) },
            "Lulustream": { domains: ["luluvid", "luluvdoo"], func: (u, q) => this._lulustreamExtractor(u, `Lulustream - ${q}`) },
            "MixDrop": { domains: ["mixdrop", "mxdrop"], func: (u, q) => this._mixdropExtractor(u, `MixDrop - ${q}`) },
            "StreamRuby": { domains: ["streamruby", "rubyvid"], func: (u, q) => this._streamrubyExtractor(u, `StreamRuby - ${q}`) },
            "Upstream": { domains: ["upstream.to"], func: (u, q) => this._upstreamExtractor(u, `Upstream - ${q}`) },
        };

        const linkElements = doc.select('#episode-servers li a');
        for (const element of linkElements) {
            try {
                let streamUrl = element.attr('data-ep-url');
                if (!streamUrl) continue;

                // --- URL Cleaning ---
                if (streamUrl.startsWith("//")) streamUrl = "https:" + streamUrl;
                if (streamUrl.includes("vidmoly.to")) streamUrl = streamUrl.replace("vidmoly.to", "vidmoly.net");

                const streamUrlLower = streamUrl.toLowerCase();
                const qualityText = element.text.trim();
                const numericQuality = this.getNumericQuality(qualityText);
                
                let extractorKey = null;

                // --- Find the correct extractor key ---
                for (const [key, { domains }] of Object.entries(extractorMap)) {
                    if (hosterSelection.includes(key) && domains.some(d => streamUrlLower.includes(d))) {
                        extractorKey = key;
                        break;
                    }
                }

                // --- Execute the found extractor or handle fallbacks ---
                if (extractorKey) {
                    const { func } = extractorMap[extractorKey];
                    const extractedVideos = await func(streamUrl, numericQuality);
                    videos.push(...extractedVideos);
                } else if (hosterSelection.includes("Mega") && streamUrlLower.includes("mega.nz")) {
                    const serverName = qualityText.split(' - ')[0].trim();
                    videos.push({
                        url: streamUrl,
                        quality: this._formatQuality(`${serverName} - ${numericQuality} (WebView)`, streamUrl),
                        headers: this._getVideoHeaders(streamUrl)
                    });
                }
            } catch (e) { /* Ignore errors from a single hoster to not fail the whole process */ }
        }

        const preferredQuality = this.getPreference("preferred_quality") || "720";
        videos.sort((a, b) => {
            const qualityA = parseInt(a.quality.match(/(\d+)p/)?.[1] || 0);
            const qualityB = parseInt(b.quality.match(/(\d+)p/)?.[1] || 0);
            const isAPreferred = a.quality.includes(preferredQuality);
            const isBPreferred = b.quality.includes(preferredQuality);
            const scoreA = qualityA + (isAPreferred ? 10000 : 0);
            const scoreB = qualityB + (isBPreferred ? 10000 : 0);
            return scoreB - scoreA;
        });
        return videos;
    }
    
    // --- EXTRACTORS ---

    async _parseM3U8(playlistUrl, prefix, headers = {}) {
        const videos = [];
        if (this.getPreference("extract_qualities")) {
            try {
                const playlistContent = (await this.client.get(playlistUrl, headers)).body;
                const lines = playlistContent.split('\n');
                const baseUrl = playlistUrl.substring(0, playlistUrl.lastIndexOf('/') + 1);
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    if (line.startsWith("#EXT-X-STREAM-INF")) {
                        const resolutionMatch = line.match(/RESOLUTION=(\d+x\d+)/);
                        const quality = resolutionMatch ? resolutionMatch[1].split('x')[1] + "p" : "Unknown";
                        let videoUrl = lines[++i];
                        if (videoUrl && !videoUrl.startsWith('http')) videoUrl = baseUrl + videoUrl;
                        if(videoUrl) videos.push({ url: videoUrl, quality: this._formatQuality(`${prefix} ${quality}`, videoUrl), headers });
                    }
                }
            } catch(e) { /* Fallback on error */ }
        }
        if (videos.length === 0) {
            videos.push({ url: playlistUrl, quality: this._formatQuality(`${prefix} Auto (HLS)`, playlistUrl), headers });
        }
        return videos;
    }
    
    async _okruExtractor(url, prefix = "Okru") {
        const res = await this.client.get(url, this.getHeaders(url));
        const dataOptions = res.body.substringAfter("data-options=\"").substringBefore("\"");
        if (!dataOptions) return [];
        const videoHeaders = this._getVideoHeaders(url);
        try {
            const json = JSON.parse(dataOptions.replace(/&quot;/g, '"'));
            const metadata = JSON.parse(json.flashvars.metadata);
            const videos = [];
            const getQualityName = (name) => ({ "full":"1080p", "hd":"720p", "sd":"480p", "low":"360p", "lowest":"240p", "mobile":"144p"}[name] || name);
            if (metadata.videos) {
                videos.push(...metadata.videos.map(video => ({
                    url: video.url, quality: this._formatQuality(`${prefix} ${getQualityName(video.name)}`, video.url), headers: videoHeaders
                })));
            }
            if (metadata.hlsManifestUrl) {
                videos.unshift({ url: metadata.hlsManifestUrl, quality: this._formatQuality(`${prefix} Auto (HLS)`, metadata.hlsManifestUrl), headers: videoHeaders });
            }
            if (videos.length > 1) { const auto = videos.shift(); videos.reverse().unshift(auto); }
            return videos;
        } catch (e) { return []; }
    }
    
    async _mp4uploadExtractor(url, quality) { const res = (await this.client.get(url, this._getVideoHeaders(url))).body; const src = res.match(/player\.src\({[^}]+src:\s*"([^"]+)"/)?.[1]; return src ? [{ url: src, quality, headers: { "Referer": url } }] : []; }
    async _doodExtractor(url, quality) { const res = await this.client.get(url, this._getVideoHeaders(url)); const pass = res.body.substringAfter("/pass_md5/").substringBefore("'"); const videoUrl = (await this.client.get(`https://${new URL(url).hostname}/pass_md5/${pass}`, this._getVideoHeaders(url))).body; const finalUrl = `${videoUrl}${Math.random().toString(36).substring(7)}?token=${pass.split('/').pop()}`; return [{ url: finalUrl, quality, headers: this._getVideoHeaders(url) }]; }
    async _voeExtractor(url, quality) { const res = await this.client.get(url, this._getVideoHeaders(url)); const hls = res.body.match(/'hls': '([^']+)'/)?.[1]; return hls ? this._parseM3U8(hls, quality.split(' - ')[0], this._getVideoHeaders(url)) : []; }
    async _streamtapeExtractor(url, quality) { const res = await this.client.get(url, this.getHeaders(url)); const script = res.body.substringAfter("document.getElementById('robotlink')").substringBefore("</script>"); if (!script) return []; const p1 = script.substringAfter("innerHTML = '").substringBefore("'"); const p2 = script.substringAfter("+ ('xcd").substringBefore("'"); return [{ url: "https:" + p1 + p2, quality, headers: this._getVideoHeaders(url) }]; }
    async _streamwishExtractor(url, prefix) { const res = await this.client.get(url, this.getHeaders(url)); let script = res.body.substringAfter("eval(function(p,a,c,k,e,d)").substringBefore("</script>"); if (!script) return []; const unpacked = unpackJs("eval(function(p,a,c,k,e,d)" + script); const masterUrl = unpacked.match(/(https?:\/\/[^"]+\.m3u8[^"]*)/)?.[1]; return masterUrl ? this._parseM3U8(masterUrl, prefix.split(' - ')[0], this._getVideoHeaders(url)) : []; }
    async _uqloadExtractor(url, prefix) { const res = await this.client.get(url, this.getHeaders(url)); const src = res.body.substringAfter("sources: [").substringBefore("]").replace(/"/g, ''); return src.startsWith("http") ? [{ url: src, quality: prefix, headers: this._getVideoHeaders("https://uqload.to/") }] : []; }
    async _vidbomExtractor(url) { const res = await this.client.get(url, this.getHeaders(url)); const script = res.body.substringAfter("sources: [").substringBefore("]"); const sources = script.split('{file:"').slice(1); let allVideos = []; for (const source of sources) { const src = source.substringBefore('"'); if (src.includes(".m3u8")) allVideos.push(...await this._parseM3U8(src, "VidShare", this._getVideoHeaders(url))); else { const label = "VidShare: " + source.substringAfter('label:"').substringBefore('"'); allVideos.push({ url: src, quality: this._formatQuality(label, src), headers: this._getVideoHeaders(url) }); } } return allVideos; }
    async _yodboxExtractor(url) { const res = await this.client.get(url, this.getHeaders(url)); const src = new Document(res.body).selectFirst("source")?.getSrc; return src ? [{ url: src, quality: this._formatQuality("Yodbox", src), headers: this._getVideoHeaders(url) }] : []; }
    async _vidmolyExtractor(url, prefix) { const res = await this.client.get(url, this._getVideoHeaders(url)); const src = res.body.substringAfter("sources: [").substringBefore("]").match(/file:"([^"]+)"/)?.[1]; return src?.includes(".m3u8") ? this._parseM3U8(src, prefix.split(' - ')[0], this._getVideoHeaders(url)) : []; }
    async _filemoonExtractor(url, prefix) { const res = await this.client.get(url, this._getVideoHeaders(url)); const jsEval = res.body.substringAfter("eval(function(p,a,c,k,e,d)").substringBefore("</script>"); if (!jsEval) return []; const unpacked = unpackJs("eval(function(p,a,c,k,e,d)" + jsEval); const masterUrl = unpacked.match(/file:"([^"]+)"/)?.[1]; return masterUrl ? this._parseM3U8(masterUrl, prefix.split(' - ')[0], this._getVideoHeaders(url)) : []; }
    async _lulustreamExtractor(url, prefix) { const res = await this.client.get(url, this.getHeaders(url)); const masterUrl = res.body.substringAfter('jwplayer("vplayer").setup({').substringBefore('});').match(/file:"([^"]+)"/)?.[1]; return masterUrl ? this._parseM3U8(masterUrl, prefix.split(' - ')[0], this._getVideoHeaders(url)) : []; }
    async _vkExtractor(url, prefix = "VK") { const res = await this.client.get(url, this._getVideoHeaders(url)); return [...res.body.matchAll(/"url(\d+)":"(.*?)"/g)].map(m => ({ url: m[2].replace(/\\/g, ''), quality: this._formatQuality(`${prefix} ${m[1]}p`, m[2].replace(/\\/g, '')), headers: this._getVideoHeaders(url) })).reverse(); }
    async _mixdropExtractor(url, prefix) { const res = await this.client.get(url, this.getHeaders(url)); let script = res.body.substringAfter("eval(function(p,a,c,k,e,d)").substringBefore("</script>"); if (!script) return []; const unpacked = unpackJs("eval(function(p,a,c,k,e,d)" + script); const videoUrl = "https:" + unpacked.match(/MDCore\.wurl="([^"]+)"/)?.[1]; return videoUrl ? [{ url: videoUrl, quality: this._formatQuality(prefix, videoUrl), headers: this._getVideoHeaders(url) }] : []; }
    async _streamrubyExtractor(url, prefix) { const res = await this.client.get(url, this.getHeaders(url)); const urls = (res.body.substringAfter("sources: [").substringBefore("]").match(/file:"([^"]+)"/g) || []).map(m => m.replace(/file:"|"/g, '')); let allVideos = []; for (const hlsUrl of urls) if (hlsUrl.includes(".m3u8")) allVideos.push(...await this._parseM3U8(hlsUrl, prefix.split(' - ')[0], this._getVideoHeaders(url))); return allVideos; }
    async _upstreamExtractor(url, prefix) { const res = await this.client.get(url, this.getHeaders(url)); let script = res.body.substringAfter("eval(function(p,a,c,k,e,d)").substringBefore("</script>"); if (!script) return []; const unpacked = unpackJs("eval(function(p,a,c,k,e,d)" + script); const masterUrl = unpacked.match(/hls:\s*"([^"]+)"/)?.[1]; return masterUrl ? this._parseM3U8(masterUrl, prefix.split(' - ')[0], this._getVideoHeaders(url)) : []; }
    async _megamaxExtractor(url, prefix) { const res = await this.client.get(url, this.getHeaders(url)); let script = res.body.substringAfter("eval(function(p,a,c,k,e,d)").substringBefore("</script>"); if (!script) return []; const unpacked = unpackJs("eval(function(p,a,c,k,e,d)" + script); const masterUrl = unpacked.match(/file:"(https[^"]+m3u8)"/)?.[1]; return masterUrl ? this._parseM3U8(masterUrl, prefix.split(' - ')[0], this._getVideoHeaders(url)) : []; }
    async _videaExtractor(url, quality) { const res = await this.client.get(url, this.getHeaders(url)); const videoUrl = res.body.substringAfter("v.player.source(").substringBefore(");").match(/'(https?:\/\/[^']+)'/)?.[1]; return videoUrl ? [{ url: videoUrl, quality, headers: this._getVideoHeaders(url) }] : []; }
    
    // --- FILTERS AND PREFERENCES ---

    getFilterList() {
        // ... Filter code is unchanged ...
        const getSlug=(href)=>href.split('/').filter(Boolean).pop();const sections=[{name:'الكل',value:''},{name:'الانمي المترجم',value:getSlug('https://ww.anime4up.rest/anime-category/%d8%a7%d9%84%d8%a7%d9%86%d9%85%d9%8a-%d8%a7%d9%84%d9%85%d8%aa%d8%b1%d8%ac%d9%85/')},{name:'الانمي المدبلج',value:getSlug('https://ww.anime4up.rest/anime-category/%d8%a7%d9%84%d8%a7%d9%86%d9%85%d9%8a-%d8%a7%d9%84%d9%85%d8%af%d8%a8%d9%84%d8%ac/')}].map(s=>({type_name:"SelectOption",name:s.name,value:s.value}));const genres=[{name:'الكل',value:''},{name:'أطفال',value:'أطفال'},{name:'أكشن',value:'أكشن'},{name:'إيتشي',value:'إيتشي'},{name:'اثارة',value:'اثارة'},{name:'الحياة العملية',value:'الحياة-العملية'},{name:'العاب',value:'العاب'},{name:'بوليسي',value:'بوليسي'},{name:'تاريخي',value:'تاريخي'},{name:'جنون',value:'جنون'},{name:'جوسي',value:'جوسي'},{name:'حربي',value:'حربي'},{name:'حريم',value:'حريم'},{name:'خارق للعادة',value:'خارق-للعادة'},{name:'خيال علمي',value:'خيال-علمي'},{name:'دراما',value:'دراما'},{name:'رعب',value:'رعب'},{name:'رومانسي',value:'رومانسي'},{name:'رياضي',value:'رياضي'},{name:'ساموراي',value:'ساموراي'},{name:'سباق',value:'سباق'},{name:'سحر',value:'سحر'},{name:'سينين',value:'سينين'},{name:'شريحة من الحياة',value:'شريحة-من-الحياة'},{name:'شوجو',value:'شوجو'},{name:'شوجو اَي',value:'شوجو-اَي'},{name:'شونين',value:'شونين'},{name:'شونين اي',value:'شونين-اي'},{name:'شياطين',value:'شياطين'},{name:'طبي',value:'طبي'},{name:'غموض',value:'غموض'},{name:'فضائي',value:'فضائي'},{name:'فنتازيا',value:'فنتازيا'},{name:'فنون تعبيرية',value:'فنون-تعبيرية'},{name:'فنون قتالية',value:'فنون-قتالية'},{name:'قوى خارقة',value:'قوى-خارقة'},{name:'كوميدي',value:'كوميدي'},{name:'مأكولات',value:'مأكولات'},{name:'محاكاة ساخرة',value:'محاكاة-ساخرة'},{name:'مدرسي',value:'مدرسي'},{name:'مصاصي دماء',value:'مصاصي-دماء'},{name:'مغامرات',value:'مغامرات'},{name:'موسيقي',value:'موسيقي'},{name:'ميكا',value:'ميكا'},{name:'نفسي',value:'نفسي'},].map(g=>({type_name:"SelectOption",name:g.name,value:encodeURIComponent(g.value)}));const statuses=[{name:'الكل',value:''},{name:'لم يعرض بعد',value:getSlug('https://ww.anime4up.rest/anime-status/%d9%84%d9%85-%d9%8a%d8%b9%d8%b1%d8%b6-%d8%a8%d8%b9%d8%af/')},{name:'مكتمل',value:'complete'},{name:'يعرض الان',value:getSlug('https://ww.anime4up.rest/anime-status/%d9%8a%d8%b9%d8%b1%d8%b6-%d8%a7%d9%84%d8%a7%d9%86-1/')}].map(s=>({type_name:"SelectOption",name:s.name,value:s.value}));const types=[{name:'الكل',value:''},{name:'Movie',value:'movie-3'},{name:'ONA',value:'ona1'},{name:'OVA',value:'ova1'},{name:'Special',value:'special1'},{name:'TV',value:'tv2'}].map(t=>({type_name:"SelectOption",name:t.name,value:t.value}));const seasons=[{name:'الكل',value:'',sortKey:'9999'}];const currentYear=new Date().getFullYear();const seasonMap={'spring':'ربيع','summer':'صيف','fall':'خريف','winter':'شتاء'};for(let year=currentYear+2;year>=2000;year--){Object.entries(seasonMap).forEach(([eng,arb],index)=>{const seasonSlug=`${arb}-${year}`;seasons.push({name:`${arb} ${year}`,value:encodeURIComponent(seasonSlug),sortKey:`${year}-${4-index}`});});}
        const seasonOptions=seasons.sort((a,b)=>b.sortKey.localeCompare(a.sortKey)).map(s=>({type_name:"SelectOption",name:s.name,value:s.value}));return[{type_name:"HeaderFilter",name:"ملاحظة: سيتم تجاهل الفلاتر في حال البحث بالاسم."},{type_name:"SelectFilter",name:"القسم",state:0,values:sections},{type_name:"SelectFilter",name:"تصنيف الأنمي",state:0,values:genres},{type_name:"SelectFilter",name:"حالة الأنمي",state:0,values:statuses},{type_name:"SelectFilter",name:"النوع",state:0,values:types},{type_name:"SelectFilter",name:"الموسم",state:0,values:seasonOptions},];
    }

    getSourcePreferences() {
        return [{
            key: "override_base_url",
            editTextPreference: { title: "تجاوز عنوان URL الأساسي", summary: "استخدم دومين مختلف للمصدر", value: this.source.baseUrl, dialogTitle: "أدخل عنوان URL الأساسي الجديد", dialogMessage: "الإفتراضي: " + this.source.baseUrl }
        }, {
            key: "preferred_quality",
            listPreference: { title: "الجودة المفضلة", summary: "اختر الجودة التي سيتم اختيارها تلقائيا", valueIndex: 1, entries: ["1080p", "720p", "480p", "360p"], entryValues: ["1080", "720", "480", "360"] }
        }, {
            key: "hoster_selection",
            multiSelectListPreference: {
                title: "اختر السيرفرات",
                summary: "اختر السيرفرات التي تريد ان تظهر",
                entries: ["DoodStream", "Voe.sx", "Mp4upload", "Ok.ru", "Vidmoly", "Uqload", "MegaMax", "VK", "Videa", "Mega.nz (WebView)", "Streamtape", "StreamWish / FileLions", "Vidbom / VidShare", "Yodbox", "Filemoon", "Lulustream", "MixDrop", "StreamRuby", "Upstream"],
                entryValues: ["Dood", "Voe", "Mp4upload", "Okru", "Vidmoly", "Uqload", "MegaMax", "VK", "Videa", "Mega", "Streamtape", "StreamWish", "Vidbom", "Yodbox", "Filemoon", "Lulustream", "MixDrop", "StreamRuby", "Upstream"],
                values: ["Dood", "Voe", "Mp4upload", "Okru", "Vidmoly", "Uqload", "MegaMax", "VK", "Videa", "Mega", "Streamtape", "StreamWish", "Vidbom", "Yodbox", "Filemoon", "Lulustream", "MixDrop", "StreamRuby", "Upstream"],
            }
        }, {
            key: "extract_qualities",
            switchPreferenceCompat: { title: "استخراج الجودات المتعددة (HLS)", summary: "عند تفعيله، سيقوم بجلب جميع الجودات المتاحة من السيرفرات الداعمة", value: true }
        }, {
            key: "show_video_url_in_quality",
            switchPreferenceCompat: { title: "إظهار رابط الفيديو", summary: "عرض رابط الفيديو النهائي بجانب اسم الجودة", value: false }
        }];
    }
}
