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
        return { "Referer": this.getBaseUrl() + "/", "Origin": this.getBaseUrl(), "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36" };
    }
    
    _getVideoHeaders(refererUrl) {
        const headers = this.getHeaders(refererUrl);
        headers["Referer"] = refererUrl;
        if (refererUrl.includes("vidmoly")) headers["Origin"] = "https://vidmoly.net";
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
                list.push({ name: linkElement.text.trim(), link: linkElement.getHref.replace(/^https?:\/\/[^\/]+/, ''), imageUrl: imageElement.getSrc });
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
    
    _formatQuality(baseQuality, url) {
        if (this.getPreference("show_video_url_in_quality") && url) {
            return `${baseQuality} - ${url}`;
        }
        return baseQuality;
    }

    // --- CORE METHODS ---

    async getPopular(page) { return this.fetchAndParseCataloguePage(`/قائمة-الانمي/page/${page}/`); }

    async getLatestUpdates(page) {
        const { list, hasNextPage } = await this.fetchAndParseCataloguePage(`/episode/page/${page}/`);
        const fixedList = list.map(item => ({ ...item, link: item.link.replace(/-%d8%a7%d9%84%d8%ad%d9%84%d9%82%d8%a9-.*$/, "").replace("/episode/", "/anime/") }));
        return { list: fixedList, hasNextPage };
    }

    async search(query, page, filters) {
        let urlPath;
        if (query) {
            urlPath = `/?search_param=animes&s=${encodeURIComponent(query)}&paged=${page}`;
        } else {
            const findFilter = (name) => filters.find(f => f.name === name);
            const getFilterValue = (filter) => filter && filter.state > 0 ? filter.values[filter.state].value : null;
            const section = getFilterValue(findFilter("القسم")), genre = getFilterValue(findFilter("تصنيف الأنمي")), status = getFilterValue(findFilter("حالة الأنمي")), type = getFilterValue(findFilter("النوع")), season = getFilterValue(findFilter("الموسم"));
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
        const chapters = doc.select(".episodes-card-title h3 a").map(element => ({ name: element.text.trim(), url: element.getHref.replace(/^https?:\/\/[^\/]+/, '') })).reverse();
        return { name, imageUrl, description, link: url, status, genre, chapters };
    }

    // --- VIDEO EXTRACTION ---

    async getVideoList(url) {
        const res = await this.client.get(this.getBaseUrl() + url, this.getHeaders(this.getBaseUrl() + url));
        const doc = new Document(res.body);
        let videos = [];
        const hosterSelection = this.getPreference("hoster_selection") || [];
        
        for (const element of doc.select('#episode-servers li a')) {
            try {
                let streamUrl = element.attr('data-ep-url');
                if (!streamUrl) continue;
                streamUrl = streamUrl.replace(/&amp;/g, '&');
                if (streamUrl.startsWith("//")) streamUrl = "https:" + streamUrl;
                if (streamUrl.includes("vidmoly.to")) streamUrl = streamUrl.replace("vidmoly.to", "vidmoly.net");

                const qualityText = element.text.trim();
                const numericQuality = this.getNumericQuality(qualityText);
                const serverName = qualityText.split(' - ')[0].trim();
                let extractedVideos = [];

                const dood_domains = ["dood", "d-s.io"];
                const streamwish_domains = ["streamwish", "filelions", "streamvid", "wolfstream"];
                const vk_domains = ["vk.com", "vkvideo.ru"];
                
                if (hosterSelection.includes("dood") && dood_domains.some(d => streamUrl.includes(d))) {
                    extractedVideos = await this._doodExtractor(streamUrl, `DoodStream - ${numericQuality}`);
                } else if (hosterSelection.includes("okru") && (streamUrl.includes("ok.ru") || streamUrl.includes("odnoklassniki"))) {
                    extractedVideos = await this._okruExtractor(streamUrl, `Ok.ru`);
                } else if (hosterSelection.includes("streamtape") && streamUrl.includes("streamtape")) {
                    extractedVideos = await this._streamtapeExtractor(streamUrl, `StreamTape - ${numericQuality}`);
                } else if (hosterSelection.includes("streamwish") && streamwish_domains.some(d => streamUrl.includes(d))) {
                     extractedVideos = await this._streamwishExtractor(streamUrl, `StreamWish`);
                } else if (hosterSelection.includes("uqload") && streamUrl.includes("uqload")) {
                    extractedVideos = await this._uqloadExtractor(streamUrl, `Uqload - ${numericQuality}`);
                } else if (hosterSelection.includes("vidmoly") && streamUrl.includes("vidmoly")) {
                    extractedVideos = await this._vidmolyExtractor(streamUrl, `Vidmoly`);
                } else if (hosterSelection.includes("filemoon") && streamUrl.includes("filemoon")) {
                    extractedVideos = await this._filemoonExtractor(streamUrl, `Filemoon`);
                } else if (hosterSelection.includes("vk") && vk_domains.some(d => streamUrl.includes(d))) {
                    extractedVideos = await this._vkExtractor(streamUrl, `VK`);
                } else if (hosterSelection.includes("generic")) {
                    videos.push({ url: streamUrl, quality: this._formatQuality(`${serverName} - ${numericQuality}`, streamUrl), headers: this._getVideoHeaders(this.getBaseUrl() + url) });
                }

                videos.push(...extractedVideos);
            } catch (e) { /* Ignore errors from a single hoster */ }
        }
        return videos;
    }
    
    // --- EXTRACTORS ---

    async _parseM3U8(playlistUrl, prefix, headers = {}) {
        const videos = [{ url: playlistUrl, originalUrl: playlistUrl, quality: this._formatQuality(`${prefix} Auto (HLS)`, playlistUrl), headers }];
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
        } catch(e) {}
        return videos;
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

    async _okruExtractor(url, prefix) {
        const res = await this.client.get(url, this.getHeaders(url));
        const dataOptions = res.body.substringAfter("data-options=\"").substringBefore("\"");
        if (!dataOptions) return [];
        const videoHeaders = { ...this._getVideoHeaders("https://ok.ru/"), "Origin": "https://ok.ru" };
        try {
            const metadata = JSON.parse(JSON.parse(dataOptions.replace(/&quot;/g, '"')).flashvars.metadata);
            const videos = [];
            const getQualityName = (n) => ({ "full": "1080p", "hd": "720p", "sd": "480p", "low": "360p", "lowest": "240p", "mobile": "144p" }[n] || n);
            if (metadata.videos) {
                videos.push(...metadata.videos.map(v => ({ url: v.url, originalUrl: v.url, headers: videoHeaders, quality: this._formatQuality(`${prefix} ${getQualityName(v.name)}`, v.url) })));
            }
            if (metadata.hlsManifestUrl) {
                videos.unshift({ url: metadata.hlsManifestUrl, originalUrl: metadata.hlsManifestUrl, headers: videoHeaders, quality: this._formatQuality(`${prefix} Auto (HLS)`, metadata.hlsManifestUrl) });
            }
            if (videos.length > 1) { const auto = videos.shift(); videos.reverse().unshift(auto); }
            return videos;
        } catch (e) { return []; }
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
        const unpacked = unpackJs("eval(function(p,a,c,k,e,d)" + script);
        const masterUrl = unpacked.match(/(https?:\/\/[^"]+\.m3u8[^"]*)/)?.[1];
        return masterUrl ? this._parseM3U8(masterUrl, prefix, this._getVideoHeaders(url)) : [];
    }

    async _uqloadExtractor(url, prefix) {
        const res = await this.client.get(url, this.getHeaders(url));
        const videoUrl = res.body.substringAfter('sources: ["').substringBefore('"]');
        return videoUrl.startsWith("http") ? [{ url: videoUrl, quality: this._formatQuality(prefix, videoUrl), originalUrl: videoUrl, headers: this._getVideoHeaders("https://uqload.to/") }] : [];
    }
    
    async _vidmolyExtractor(url, prefix) {
        const res = await this.client.get(url, this._getVideoHeaders(url));
        const hlsUrl = res.body.substringAfter('file:"').substringBefore('"');
        return (hlsUrl && hlsUrl.includes(".m3u8")) ? this._parseM3U8(hlsUrl, prefix, this._getVideoHeaders(url)) : [];
    }

    async _filemoonExtractor(url, prefix) {
        const res = await this.client.get(url, this.getHeaders(url));
        const jsEval = res.body.substringAfter("eval(function(p,a,c,k,e,d)").substringBefore("</script>");
        if (!jsEval) return [];
        const unpacked = unpackJs("eval(function(p,a,c,k,e,d)" + jsEval);
        const masterUrl = unpacked.match(/file:"([^"]+)"/)?.[1];
        return masterUrl ? this._parseM3U8(masterUrl, prefix, { ...this._getVideoHeaders(url), "Origin": `https://${new URL(url).hostname}` }) : [];
    }
    
    async _vkExtractor(url, prefix) {
        const res = await this.client.get(url, this.getHeaders(url));
        const matches = [...res.body.matchAll(/"url(\d+)":"(.*?)"/g)];
        return matches.map(match => ({ url: match[2].replace(/\\/g, ''), originalUrl: match[2].replace(/\\/g, ''), quality: this._formatQuality(`${prefix} ${match[1]}p`, match[2].replace(/\\/g, '')), headers: { ...this._getVideoHeaders("https://vk.com/"), "Origin": "https://vk.com" } })).reverse();
    }

    // --- FILTERS AND PREFERENCES ---

    getFilterList() {
        // ... (Filter code remains unchanged)
        const getSlug = (href) => href.split('/').filter(Boolean).pop();const sections=[{name:'الكل',value:''},{name:'الانمي المترجم',value:getSlug('https://ww.anime4up.rest/anime-category/%d8%a7%d9%84%d8%a7%d9%86%d9%85%d9%8a-%d8%a7%d9%84%d9%85%d8%aa%d8%b1%d8%ac%d9%85/')},{name:'الانمي المدبلج',value:getSlug('https://ww.anime4up.rest/anime-category/%d8%a7%d9%84%d8%a7%d9%86%d9%85%d9%8a-%d8%a7%d9%84%d9%85%d8%af%d8%a8%d9%84%d8%ac/')}].map(s=>({type_name:"SelectOption",name:s.name,value:s.value}));const genres=[{name:'الكل',value:''},{name:'أطفال',value:'أطفال'},{name:'أكشن',value:'أكشن'},{name:'إيتشي',value:'إيتشي'},{name:'اثارة',value:'اثارة'},{name:'الحياة العملية',value:'الحياة-العملية'},{name:'العاب',value:'العاب'},{name:'بوليسي',value:'بوليسي'},{name:'تاريخي',value:'تاريخي'},{name:'جنون',value:'جنون'},{name:'جوسي',value:'جوسي'},{name:'حربي',value:'حربي'},{name:'حريم',value:'حريم'},{name:'خارق للعادة',value:'خارق-للعادة'},{name:'خيال علمي',value:'خيال-علمي'},{name:'دراما',value:'دراما'},{name:'رعب',value:'رعب'},{name:'رومانسي',value:'رومانسي'},{name:'رياضي',value:'رياضي'},{name:'ساموراي',value:'ساموراي'},{name:'سباق',value:'سباق'},{name:'سحر',value:'سحر'},{name:'سينين',value:'سينين'},{name:'شريحة من الحياة',value:'شريحة-من-الحياة'},{name:'شوجو',value:'شوجو'},{name:'شوجو اَي',value:'شوجو-اَي'},{name:'شونين',value:'شونين'},{name:'شونين اي',value:'شونين-اي'},{name:'شياطين',value:'شياطين'},{name:'طبي',value:'طبي'},{name:'غموض',value:'غموض'},{name:'فضائي',value:'فضائي'},{name:'فنتازيا',value:'فنتازيا'},{name:'فنون تعبيرية',value:'فنون-تعبيرية'},{name:'فنون قتالية',value:'فنون-قتالية'},{name:'قوى خارقة',value:'قوى- خارقة'},{name:'كوميدي',value:'كوميدي'},{name:'مأكولات',value:'مأكولات'},{name:'محاكاة ساخرة',value:'محاكاة-ساخرة'},{name:'مدرسي',value:'مدرسي'},{name:'مصاصي دماء',value:'مصاصي-دماء'},{name:'مغامرات',value:'مغامرات'},{name:'موسيقي',value:'موسيقي'},{name:'ميكا',value:'ميكا'},{name:'نفسي',value:'نفسي'},].map(g=>({type_name:"SelectOption",name:g.name,value:encodeURIComponent(g.value)}));const statuses=[{name:'الكل',value:''},{name:'لم يعرض بعد',value:getSlug('https://ww.anime4up.rest/anime-status/%d9%84%d9%85-%d9%8a%d8%b9%d8%b1%d8%b6-%d8%a8%d8%b9%d8%af/')},{name:'مكتمل',value:'complete'},{name:'يعرض الان',value:getSlug('https://ww.anime4up.rest/anime-status/%d9%8a%d8%b9%d8%b1%d8%b6-%d8%a7%d9%84%d8%a7%d9%86-1/')}].map(s=>({type_name:"SelectOption",name:s.name,value:s.value}));const types=[{name:'الكل',value:''},{name:'Movie',value:'movie-3'},{name:'ONA',value:'ona1'},{name:'OVA',value:'ova1'},{name:'Special',value:'special1'},{name:'TV',value:'tv2'}].map(t=>({type_name:"SelectOption",name:t.name,value:t.value}));const seasons=[{name:'الكل',value:'',sortKey:'9999'}];const currentYear=new Date().getFullYear();const seasonMap={'spring':'ربيع','summer':'صيف','fall':'خريف','winter':'شتاء'};for(let year=currentYear+2;year>=2000;year--){Object.entries(seasonMap).forEach(([eng,arb],index)=>{const seasonSlug=`${arb}-${year}`;seasons.push({name:`${arb} ${year}`,value:encodeURIComponent(seasonSlug),sortKey:`${year}-${4-index}`});});}
        const seasonOptions=seasons.sort((a,b)=>b.sortKey.localeCompare(a.sortKey)).map(s=>({type_name:"SelectOption",name:s.name,value:s.value}));return[{type_name:"HeaderFilter",name:"ملاحظة: سيتم تجاهل الفلاتر في حال البحث بالاسم."},{type_name:"SelectFilter",name:"القسم",state:0,values:sections},{type_name:"SelectFilter",name:"تصنيف الأنمي",state:0,values:genres},{type_name:"SelectFilter",name:"حالة الأنمي",state:0,values:statuses},{type_name:"SelectFilter",name:"النوع",state:0,values:types},{type_name:"SelectFilter",name:"الموسم",state:0,values:seasonOptions},];
    }
    
    getSourcePreferences() {
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
            key: "hoster_selection",
            multiSelectListPreference: {
                title: "اختر السيرفرات",
                summary: "اختر السيرفرات التي تريد ان تظهر",
                entries: ["DoodStream & Variants", "Okru", "StreamTape", "StreamWish & Variants", "Uqload", "Vidmoly", "Filemoon", "VK", "Generic/WebView (Fallback)"],
                entryValues: ["dood", "okru", "streamtape", "streamwish", "uqload", "vidmoly", "filemoon", "vk", "generic"],
                values: ["dood", "okru", "streamtape", "streamwish", "uqload", "vidmoly", "filemoon", "vk"],
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
        }];
    }
}
