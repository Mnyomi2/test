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
        return "720p"; // Default quality
    }

    // --- CORE METHODS ---

    async getPopular(page) {
        const path = `/قائمة-الانمي/page/${page}/`;
        return this.fetchAndParseCataloguePage(path);
    }

    async getLatestUpdates(page) {
        const path = `/episode/page/${page}/`;
        const result = await this.fetchAndParseCataloguePage(path);

        const fixedList = result.list.map(item => ({
            ...item,
            link: item.link
                .replace(/-%d8%a7%d9%84%d8%ad%d9%84%d9%82%d8%a9-.*$/, "")
                .replace("/episode/", "/anime/")
        }));

        return { list: fixedList, hasNextPage: result.hasNextPage };
    }

    async search(query, page, filters) {
        let urlPath;
        if (query) {
            urlPath = `/?search_param=animes&s=${encodeURIComponent(query)}&paged=${page}`;
        } else {
            const sectionFilter = filters.find(f => f.name === "القسم");
            const genreFilter = filters.find(f => f.name === "تصنيف الأنمي");
            const statusFilter = filters.find(f => f.name === "حالة الأنمي");
            const typeFilter = filters.find(f => f.name === "النوع");
            const seasonFilter = filters.find(f => f.name === "الموسم");
            let basePath = "";
            if (sectionFilter && sectionFilter.state > 0) {
                const value = sectionFilter.values[sectionFilter.state].value;
                basePath = `/anime-category/${value}/`;
            } else if (genreFilter && genreFilter.state > 0) {
                const value = genreFilter.values[genreFilter.state].value;
                basePath = `/anime-genre/${value}/`;
            } else if (statusFilter && statusFilter.state > 0) {
                const value = statusFilter.values[statusFilter.state].value;
                basePath = `/anime-status/${value}/`;
            } else if (typeFilter && typeFilter.state > 0) {
                const value = typeFilter.values[typeFilter.state].value;
                basePath = `/anime-type/${value}/`;
            } else if (seasonFilter && seasonFilter.state > 0) {
                const value = seasonFilter.values[seasonFilter.state].value;
                basePath = `/anime-season/${value}/`;
            }
            if (basePath) {
                urlPath = `${basePath}?page=${page}`;
            } else {
                urlPath = `/قائمة-الانمي/page/${page}/`;
            }
        }
        return this.fetchAndParseCataloguePage(urlPath);
    }

    async getDetail(url) {
        const res = await this.client.get(this.getBaseUrl() + url, this.getHeaders(this.getBaseUrl() + url));
        const doc = new Document(res.body);
        const name = doc.selectFirst("h1.anime-details-title").text;
        const imageUrl = doc.selectFirst("div.anime-thumbnail img.thumbnail").getSrc;
        const description = doc.selectFirst("p.anime-story").text;
        const link = url;
        const statusText = doc.selectFirst("div.anime-info:contains(حالة الأنمي) a")?.text ?? '';
        const status = { "يعرض الان": 0, "مكتمل": 1 }[statusText] ?? 5;
        const genre = doc.select("ul.anime-genres > li > a").map(e => e.text);
        const chapters = [];
        const episodeElements = doc.select(".episodes-card-title h3 a");
        for (const element of episodeElements) {
            chapters.push({
                name: element.text.trim(),
                url: element.getHref.replace(/^https?:\/\/[^\/]+/, '')
            });
        }
        chapters.reverse();
        return { name, imageUrl, description, link, status, genre, chapters };
    }

    // --- VIDEO EXTRACTION ---

    async getVideoList(url) {
        const res = await this.client.get(this.getBaseUrl() + url, this.getHeaders(this.getBaseUrl() + url));
        const doc = new Document(res.body);
        let videos = [];
        const hosterSelection = this.getPreference("hoster_selection") || [];
        const genericVideoHeaders = this._getVideoHeaders(this.getBaseUrl() + url);

        const linkElements = doc.select('#episode-servers li a');
        for (const element of linkElements) {
            try {
                let streamUrl = element.attr('data-ep-url');
                if (!streamUrl) continue;

                if (streamUrl.startsWith("//")) {
                    streamUrl = "https:" + streamUrl;
                }
                
                // Specific fix for Vidmoly domain change
                if (streamUrl.includes("vidmoly.to")) {
                    streamUrl = streamUrl.replace("vidmoly.to", "vidmoly.net");
                }

                const qualityText = element.text.trim();
                const numericQuality = this.getNumericQuality(qualityText);
                const serverName = qualityText.split(' - ')[0].trim();
                
                let extractedVideos = [];
                const streamUrlLower = streamUrl.toLowerCase();

                if (hosterSelection.includes("Mp4upload") && streamUrlLower.includes("mp4upload")) {
                    extractedVideos = await this._mp4uploadExtractor(streamUrl, `Mp4upload - ${numericQuality}`);
                } else if (hosterSelection.includes("Dood") && (streamUrlLower.includes("dood") || streamUrlLower.includes("d-s.io"))) {
                    extractedVideos = await this._doodExtractor(streamUrl, `DoodStream - ${numericQuality}`);
                } else if (hosterSelection.includes("Okru") && (streamUrlLower.includes("ok.ru") || streamUrlLower.includes("odnoklassniki"))) {
                    extractedVideos = await this._okruExtractor(streamUrl, `Ok.ru`);
                } else if (hosterSelection.includes("Voe") && streamUrlLower.includes("voe.sx")) {
                    extractedVideos = await this._voeExtractor(streamUrl, `Voe.sx - ${numericQuality}`);
                } else if (hosterSelection.includes("Vidmoly") && streamUrlLower.includes("vidmoly")) {
                    extractedVideos = await this._vidmolyExtractor(streamUrl, `Vidmoly - ${numericQuality}`);
                } else if (hosterSelection.includes("Uqload") && streamUrlLower.includes("uqload")) {
                    extractedVideos = await this._uqloadExtractor(streamUrl, `Uqload - ${numericQuality}`);
                } else if (hosterSelection.includes("MegaMax") && streamUrlLower.includes("megamax")) {
                    extractedVideos = await this._megamaxExtractor(streamUrl, `MegaMax - ${numericQuality}`);
                } else if (hosterSelection.includes("VK") && (streamUrlLower.includes("vk.com") || streamUrlLower.includes("vkvideo.ru"))) {
                    extractedVideos = await this._vkExtractor(streamUrl, `VK`);
                } else if (hosterSelection.includes("Videa") && streamUrlLower.includes("videa.hu")) {
                    extractedVideos = await this._videaExtractor(streamUrl, `Videa - ${numericQuality}`);
                } else if (hosterSelection.includes("Mega") && streamUrlLower.includes("mega.nz")) {
                    // Mega.nz uses encryption that can't be handled by extractors.
                    // It will fall back to WebView if the user has it enabled.
                    videos.push({ url: streamUrl, quality: `${serverName} - ${numericQuality}`, headers: genericVideoHeaders });
                }

                videos.push(...extractedVideos);
            } catch (e) { /* Ignore errors from a single hoster */ }
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
        try {
            const playlistContent = (await this.client.get(playlistUrl, headers)).body;
            const lines = playlistContent.split('\n');
            const baseUrl = playlistUrl.substring(0, playlistUrl.lastIndexOf('/') + 1);
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (line.startsWith("#EXT-X-STREAM-INF")) {
                    const resolutionMatch = line.match(/RESOLUTION=(\d+x\d+)/);
                    let quality = "Unknown";
                    if (resolutionMatch) {
                        quality = resolutionMatch[1].split('x')[1] + "p";
                    }
                    let videoUrl = lines[++i];
                    if (videoUrl && !videoUrl.startsWith('http')) {
                        videoUrl = baseUrl + videoUrl;
                    }
                    if(videoUrl) {
                        videos.push({ url: videoUrl, originalUrl: videoUrl, quality: `${prefix} ${quality}`, headers });
                    }
                }
            }
            if (videos.length > 0) return videos;
        } catch(e) { /* Fallback */ }
        videos.push({ url: playlistUrl, originalUrl: playlistUrl, quality: `${prefix} Auto (HLS)`, headers });
        return videos;
    }

    async _mp4uploadExtractor(url, quality) {
        const embedHtml = (await this.client.get(url, this._getVideoHeaders(url))).body;
        const sourceMatch = embedHtml.match(/player\.src\({[^}]+src:\s*"([^"]+)"/);
        if (sourceMatch && sourceMatch[1]) {
            return [{ url: sourceMatch[1], originalUrl: sourceMatch[1], quality: quality, headers: { "Referer": url } }];
        }
        return [];
    }

    async _doodExtractor(url, quality) {
        const res = await this.client.get(url, this._getVideoHeaders(url));
        const passMd5 = res.body.substringAfter("/pass_md5/").substringBefore("'");
        const doodApi = `https://${new URL(url).hostname}/pass_md5/${passMd5}`;
        const videoUrl = (await this.client.get(doodApi, this._getVideoHeaders(url))).body;
        const randomString = Math.random().toString(36).substring(7);
        const finalUrl = `${videoUrl}${randomString}?token=${passMd5.substring(passMd5.lastIndexOf('/') + 1)}`;
        return [{ url: finalUrl, quality, originalUrl: finalUrl, headers: this._getVideoHeaders(url) }];
    }

    async _voeExtractor(url, quality) {
        const res = await this.client.get(url, this._getVideoHeaders(url));
        const script = res.body.substringAfter("sources = {").substringBefore("};");
        const hlsUrl = script.match(/'hls': '([^']+)'/)?.[1];
        if (!hlsUrl) return [];
        return this._parseM3U8(hlsUrl, "Voe.sx");
    }

    async _okruExtractor(url, prefix = "Okru") {
        const res = await this.client.get(url, this._getVideoHeaders(url));
        const dataOptions = res.body.substringAfter("data-options=\"").substringBefore("\"");
        if (!dataOptions) return [];
        try {
            const json = JSON.parse(dataOptions.replace(/&quot;/g, '"'));
            const metadata = JSON.parse(json.flashvars.metadata);
            const getQualityName = (name) => ({ "full": "1080p", "hd": "720p", "sd": "480p", "low": "360p" }[name] || name);
            return metadata.videos.map(video => ({
                url: video.url, originalUrl: video.url, quality: `${prefix} ${getQualityName(video.name)}`,
                headers: this._getVideoHeaders("https://ok.ru/")
            })).reverse();
        } catch (e) { return []; }
    }
    
    async _vidmolyExtractor(url, prefix) {
        const res = await this.client.get(url, this._getVideoHeaders(url));
        const script = res.body.substringAfter("sources: [").substringBefore("]");
        if (!script) return [];
        const hlsUrl = script.match(/file:"([^"]+)"/)?.[1];
        if (!hlsUrl || !hlsUrl.includes(".m3u8")) return [];
        return this._parseM3U8(hlsUrl, prefix, this._getVideoHeaders(url));
    }
    
    async _uqloadExtractor(url, prefix) {
        const res = await this.client.get(url, this.getHeaders(url));
        const script = res.body.substringAfter("sources: [").substringBefore("]");
        if (!script) return [];
        const videoUrl = script.replace(/"/g, '');
        if (!videoUrl.startsWith("http")) return [];
        return [{ url: videoUrl, quality: prefix, originalUrl: videoUrl, headers: this._getVideoHeaders("https://uqload.to/") }];
    }

    async _megamaxExtractor(url, prefix) {
        const res = await this.client.get(url, this.getHeaders(url));
        let script = res.body.substringAfter("eval(function(p,a,c,k,e,d)").substringBefore("</script>");
        if (!script) return [];
        script = "eval(function(p,a,c,k,e,d)" + script;
        const unpacked = unpackJs(script);
        const masterUrl = unpacked.match(/file:"(https[^"]+m3u8)"/)?.[1];
        if (!masterUrl) return [];
        return this._parseM3U8(masterUrl, prefix, this._getVideoHeaders(url));
    }
    
    async _vkExtractor(url, prefix = "VK") {
        const videoHeaders = { ...this._getVideoHeaders("https://vk.com/"), "Origin": "https://vk.com" };
        const res = await this.client.get(url, videoHeaders);
        const matches = [...res.body.matchAll(/"url(\d+)":"(.*?)"/g)];
        return matches.map(match => {
            const qualityLabel = `${prefix} ${match[1]}p`;
            const videoUrl = match[2].replace(/\\/g, '');
            return { url: videoUrl, originalUrl: videoUrl, quality: qualityLabel, headers: videoHeaders };
        }).reverse();
    }

    async _videaExtractor(url, quality) {
        const res = await this.client.get(url, this.getHeaders(url));
        const sourceLine = res.body.substringAfter("v.player.source(").substringBefore(");");
        const videoUrl = sourceLine.match(/'(https?:\/\/[^']+)'/)?.[1];
        if (!videoUrl) return [];
        return [{ url: videoUrl, originalUrl: videoUrl, quality: quality, headers: this._getVideoHeaders(url) }];
    }

    // --- FILTERS AND PREFERENCES ---

    getFilterList() {
        // ... (Filter code remains unchanged)
        const getSlug = (href) => href.split('/').filter(Boolean).pop();const sections=[{name:'الكل',value:''},{name:'الانمي المترجم',value:getSlug('https://ww.anime4up.rest/anime-category/%d8%a7%d9%84%d8%a7%d9%86%d9%85%d9%8a-%d8%a7%d9%84%d9%85%d8%aa%d8%b1%d8%ac%d9%85/')},{name:'الانمي المدبلج',value:getSlug('https://ww.anime4up.rest/anime-category/%d8%a7%d9%84%d8%a7%d9%86%d9%85%d9%8a-%d8%a7%d9%84%d9%85%d8%af%d8%a8%d9%84%d8%ac/')}].map(s=>({type_name:"SelectOption",name:s.name,value:s.value}));const genres=[{name:'الكل',value:''},{name:'أطفال',value:'أطفال'},{name:'أكشن',value:'أكشن'},{name:'إيتشي',value:'إيتشي'},{name:'اثارة',value:'اثارة'},{name:'الحياة العملية',value:'الحياة-العملية'},{name:'العاب',value:'العاب'},{name:'بوليسي',value:'بوليسي'},{name:'تاريخي',value:'تاريخي'},{name:'جنون',value:'جنون'},{name:'جوسي',value:'جوسي'},{name:'حربي',value:'حربي'},{name:'حريم',value:'حريم'},{name:'خارق للعادة',value:'خارق-للعادة'},{name:'خيال علمي',value:'خيال-علمي'},{name:'دراما',value:'دراما'},{name:'رعب',value:'رعب'},{name:'رومانسي',value:'رومانسي'},{name:'رياضي',value:'رياضي'},{name:'ساموراي',value:'ساموراي'},{name:'سباق',value:'سباق'},{name:'سحر',value:'سحر'},{name:'سينين',value:'سينين'},{name:'شريحة من الحياة',value:'شريحة-من-الحياة'},{name:'شوجو',value:'شوجو'},{name:'شوجو اَي',value:'شوجو-اَي'},{name:'شونين',value:'شونين'},{name:'شونين اي',value:'شونين-اي'},{name:'شياطين',value:'شياطين'},{name:'طبي',value:'طبي'},{name:'غموض',value:'غموض'},{name:'فضائي',value:'فضائي'},{name:'فنتازيا',value:'فنتازيا'},{name:'فنون تعبيرية',value:'فنون-تعبيرية'},{name:'فنون قتالية',value:'فنون-قتالية'},{name:'قوى خارقة',value:'قوى-خارقة'},{name:'كوميدي',value:'كوميدي'},{name:'مأكولات',value:'مأكولات'},{name:'محاكاة ساخرة',value:'محاكاة-ساخرة'},{name:'مدرسي',value:'مدرسي'},{name:'مصاصي دماء',value:'مصاصي-دماء'},{name:'مغامرات',value:'مغامرات'},{name:'موسيقي',value:'موسيقي'},{name:'ميكا',value:'ميكا'},{name:'نفسي',value:'نفسي'},].map(g=>({type_name:"SelectOption",name:g.name,value:encodeURIComponent(g.value)}));const statuses=[{name:'الكل',value:''},{name:'لم يعرض بعد',value:getSlug('https://ww.anime4up.rest/anime-status/%d9%84%d9%85-%d9%8a%d8%b9%d8%b1%d8%b6-%d8%a8%d8%b9%d8%af/')},{name:'مكتمل',value:'complete'},{name:'يعرض الان',value:getSlug('https://ww.anime4up.rest/anime-status/%d9%8a%d8%b9%d8%b1%d8%b6-%d8%a7%d9%84%d8%a7%d9%86-1/')}].map(s=>({type_name:"SelectOption",name:s.name,value:s.value}));const types=[{name:'الكل',value:''},{name:'Movie',value:'movie-3'},{name:'ONA',value:'ona1'},{name:'OVA',value:'ova1'},{name:'Special',value:'special1'},{name:'TV',value:'tv2'}].map(t=>({type_name:"SelectOption",name:t.name,value:t.value}));const seasons=[{name:'الكل',value:'',sortKey:'9999'}];const currentYear=new Date().getFullYear();const seasonMap={'spring':'ربيع','summer':'صيف','fall':'خريف','winter':'شتاء'};for(let year=currentYear+2;year>=2000;year--){Object.entries(seasonMap).forEach(([eng,arb],index)=>{const seasonSlug=`${arb}-${year}`;seasons.push({name:`${arb} ${year}`,value:encodeURIComponent(seasonSlug),sortKey:`${year}-${4-index}`});});}
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
                entries: ["DoodStream", "Voe.sx", "Mp4upload", "Ok.ru", "Vidmoly", "Uqload", "MegaMax", "VK", "Videa", "Mega.nz (WebView only)"],
                entryValues: ["Dood", "Voe", "Mp4upload", "Okru", "Vidmoly", "Uqload", "MegaMax", "VK", "Videa", "Mega"],
                values: ["Dood", "Voe", "Mp4upload", "Okru", "Vidmoly", "Uqload", "MegaMax", "VK", "Videa", "Mega"],
            }
        }];
    }
}
