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
    
    // --- BASIC BROWSE/DETAIL METHODS (UNCHANGED) ---
    async requestDoc(path, headers = {}) {
        const url = this.source.baseUrl + path;
        const res = await this.client.get(url, this.getHeaders(url));
        return new Document(res.body);
    }
    _titleEdit(title){let editedTitle=title?title.trim():"";if(!editedTitle)return editedTitle;const arabicSeasonMap={"الاول":"1","الثاني":"2","الثالث":"3","الرابع":"4","الخامس":"5","السادس":"6","السابع":"7","الثامن":"8","التاسع":"9","العاشر":"10","الحادي عشر":"11","الثاني عشر":"12"};editedTitle=editedTitle.replace(/[\u2013\u2014\u2015\u2212]/g,'-');editedTitle=editedTitle.replace(/\s*\(.*?\)\s*/g,' ').replace(/\s*\[.*?\]\s*/g,' ');let extractedYear='';editedTitle=editedTitle.replace(/\b(\d{4})\b/,(match,p1)=>{extractedYear=p1;return '';});editedTitle=editedTitle.replace(/^(?:فيلم|عرض|مسلسل|برنامج|انمي)\s+/i,'');for(const key in arabicSeasonMap){const regex=new RegExp(`الموسم\\s*(?:ال)*${key}\\b`,'gi');editedTitle=editedTitle.replace(regex,`الموسم ${arabicSeasonMap[key]}`);}
    editedTitle=editedTitle.replace(/الموسم\s*(\d+)/gi,'s$1').replace(/الحلقة\s*(\d+)/gi,'E$1');editedTitle=editedTitle.replace(/\s+(?:مترجم|مترجمة|مدبلج|مدبلجة|اون لاين|اونلاين|كامل|بجودة|جودة|عالية|حصريا|مشاهدة)\s*$/gi,'');editedTitle=editedTitle.replace(/\b(?:HD|4K|FHD|UHD|HDRip|BluRay|WEB-DL|720p|1080p)\b/gi,'');editedTitle=editedTitle.replace(/\s+/g,' ');if(extractedYear)editedTitle+=` (${extractedYear})`;return editedTitle.trim();}
    async _processListingItems(doc){const list=[];const items=doc.select("div.Block--Item, div.Small--Box");for(const item of items){const linkElement=item.selectFirst("a");if(!linkElement)continue;const link=linkElement.getHref;const rawTitle=linkElement.attr("title")||item.selectFirst("h3.title")?.text;const name=this._titleEdit(rawTitle);const imageUrl=item.selectFirst("img")?.attr("data-src");if(link.includes('/series/')){try{const seriesDoc=await this.requestDoc(link.replace(this.source.baseUrl,''));const seasonElements=seriesDoc.select("section.allseasonss div.Small--Box.Season");if(seasonElements.length>0){for(const season of seasonElements){const sLinkEl=season.selectFirst("a");if(!sLinkEl)continue;const sTitle=sLinkEl.attr("title")||season.selectFirst("h3.title")?.text;list.push({name:this._titleEdit(sTitle),imageUrl:season.selectFirst("img")?.attr("data-src"),link:sLinkEl.getHref});}}else list.push({name,imageUrl,link});}catch(e){list.push({name,imageUrl,link});}}else list.push({name,imageUrl,link});}
    return list;}
    async getPopular(page){const doc=await this.requestDoc(`/movies/page/${page}/`);return{list:await this._processListingItems(doc),hasNextPage:!!doc.selectFirst("div.pagination a.next")};}
    async getLatestUpdates(page){const doc=await this.requestDoc(`/recent/page/${page}/`);return{list:await this._processListingItems(doc),hasNextPage:!!doc.selectFirst("div.pagination a.next")};}
    async search(query,page,filters){let path;const categoryFilter=filters[0];if(query){path=`/search/?query=${encodeURIComponent(query)}&offset=${page-1}`;}else{const selectedCategory=categoryFilter.values[categoryFilter.state].value;if(selectedCategory){path=`${selectedCategory.endsWith('/')?selectedCategory:selectedCategory+'/'}page/${page}/`;}else return this.getPopular(page);}
    const doc=await this.requestDoc(path);return{list:await this._processListingItems(doc),hasNextPage:!!doc.selectFirst("div.pagination a.next")};}
    async getDetail(url){const doc=await this.requestDoc(url.replace(this.source.baseUrl,''));const name=this._titleEdit(doc.selectFirst("h1.post-title")?.text);const imageUrl=doc.selectFirst("div.image img")?.getSrc;const description=doc.selectFirst("div.story")?.text.trim();const genre=doc.select("div.catssection li a").map(e=>e.text);const chapters=[];const episodeElements=doc.select("section.allepcont div.row a");if(episodeElements.length>0){episodeElements.forEach(ep=>chapters.push({name:this._titleEdit(ep.attr("title")),url:ep.getHref}));}else{chapters.push({name:"مشاهدة",url:url});}
    return{name,imageUrl,description,genre,status:1,chapters,link:url};}

    // --- VIDEO EXTRACTION ---

    async getVideoList(url) {
        const videos = [];
        const hosterSelection = this.getPreference("hoster_selection") || [];
        const watchUrl = url.endsWith('/watch/') ? url : (url.endsWith('/') ? `${url}watch/` : `${url}/watch/`);

        const extractorMap = [
            { key: 'vidtube',    domains: ['vidtube.pro'],  func: this._vidtubeExtractor },
            { key: 'dood',       domains: ['d0o0d.com', 'dood.yt'],  func: this._doodstreamExtractor },
            { key: 'streamwish', domains: ['streamwish.fun', 'vidhide.fun'], func: this._streamwishExtractor },
            { key: 'streamtape', domains: ['streamtape.cc'],  func: this._streamtapeExtractor },
            { key: 'lulustream', domains: ['luluvdo.com'],    func: this._lulustreamExtractor },
            { key: 'uqload',     domains: ['uqload.cx'],      func: this._uqloadExtractor },
            { key: 'filemoon',   domains: ['filemoon.sx'],    func: this._filemoonExtractor },
            { key: 'mixdrop',    domains: ['mixdrop.ps'],     func: this._mixdropExtractor },
        ];
        
        try {
            const doc = await this.requestDoc(watchUrl.replace(this.getBaseUrl(), ''));
            const serverElements = doc.select("li.server--item");

            for (const serverEl of serverElements) {
                let iframeSrc = null;
                let serverName = null;
                try {
                    serverName = serverEl.selectFirst("span")?.text.trim();
                    const dataId = serverEl.attr("data-id");
                    const dataServer = serverEl.attr("data-server");
                    if (!serverName || !dataId || !dataServer) continue;

                    const ajaxUrl = `${this.getBaseUrl()}/wp-content/themes/movies2023/Ajaxat/Single/Server.php`;
                    const res = await this.client.post(ajaxUrl, {
                        headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "X-Requested-With": "XMLHttpRequest", "Referer": watchUrl },
                        body: `id=${dataId}&i=${dataServer}`
                    });
                    iframeSrc = new Document(res.body).selectFirst("iframe")?.getSrc;
                    if (!iframeSrc) continue;
                    
                    let foundVideos = false;
                    const extractor = extractorMap.find(ext => hosterSelection.includes(ext.key) && ext.domains.some(d => iframeSrc.includes(d)));

                    if (extractor) {
                        const extracted = await extractor.func.call(this, iframeSrc, serverName);
                        if (extracted.length > 0) {
                            videos.push(...extracted);
                            foundVideos = true;
                        }
                    }
                    
                    // --- Fallback Extractor Logic ---
                    if (!foundVideos && this.getPreference("use_fallback_extractor")) {
                        const fallbackVideos = await this._allinoneExtractor(iframeSrc, `[Fallback] ${serverName}`);
                        if (fallbackVideos.length > 0) {
                            videos.push(...fallbackVideos);
                            foundVideos = true;
                        }
                    }

                    if (!foundVideos && hosterSelection.includes('other')) {
                        let quality = `[Embed] ${serverName}`;
                        if (this.getPreference("show_embed_url_in_quality")) quality += ` [${iframeSrc}]`;
                        videos.push({ url: iframeSrc, originalUrl: iframeSrc, quality: quality });
                    }
                } catch (e) { /* Continue to next server on error */ }
            }
        } catch (e) { /* Failed to fetch watch page */ }

        // Sort videos
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
                    const resolution = lines[i].match(/RESOLUTION=(\d+x\d+)/)?.[1];
                    const quality = resolution ? resolution.split('x')[1] + "p" : "Unknown";
                    let videoUrl = lines[++i];
                    if (videoUrl && !videoUrl.startsWith('http')) videoUrl = baseUrl + videoUrl;
                    if (videoUrl) videos.push({ url: videoUrl, originalUrl: videoUrl, quality: this._formatQuality(prefix, videoUrl, quality), headers });
                }
            }
        } catch(e) {}
        if (videos.length === 0) videos.push({ url: playlistUrl, originalUrl: playlistUrl, quality: this._formatQuality(prefix, playlistUrl, "Auto HLS"), headers });
        return videos;
    }
    async _vidtubeExtractor(url, prefix) {
        const videos = [];
        try {
            const vidtubeOrigin = new URL(url).origin;
            const res1 = await this.client.get(url, { headers: this._getVideoHeaders(this.getBaseUrl()) });
            const doc1 = new Document(res1.body);
            for (const linkEl of doc1.select("div.row.mb-3 a.btn.btn-light")) {
                try {
                    const dlPageUrl = new URL(linkEl.getHref, vidtubeOrigin).href;
                    const qualityText = linkEl.selectFirst("b.text-primary")?.text.trim() || "Unknown";
                    const res2 = await this.client.get(dlPageUrl, { headers: { "Referer": url }, webView: true });
                    const finalVideoUrl = new Document(res2.body).selectFirst("a.btn.btn-gradient.submit-btn")?.getHref;
                    if (finalVideoUrl) videos.push({ url: finalVideoUrl, originalUrl: finalVideoUrl, quality: this._formatQuality(prefix, finalVideoUrl, qualityText), headers: this._getVideoHeaders(dlPageUrl) });
                } catch(e) {}
            }
        } catch(e) {}
        return videos;
    }
    async _streamwishExtractor(url, prefix) {
        const res = await this.client.get(url, this.getHeaders(url));
        const script = res.body.substringAfter("eval(function(p,a,c,k,e,d)").substringBefore("</script>");
        if (!script) return [];
        const unpacked = unpackJs("eval(function(p,a,c,k,e,d)" + script);
        const masterUrl = unpacked.match(/(https?:\/\/[^"]+\.m3u8[^"]*)/)?.[1];
        return masterUrl ? this._parseM3U8(masterUrl, prefix, this._getVideoHeaders(url)) : [];
    }
    async _filemoonExtractor(url, prefix) {
        const res = await this.client.get(url, this.getHeaders(url));
        const script = res.body.substringAfter("eval(function(p,a,c,k,e,d)").substringBefore("</script>");
        if (!script) return [];
        const unpacked = unpackJs("eval(function(p,a,c,k,e,d)" + script);
        const masterUrl = unpacked.match(/(https?:\/\/[^"]+\.m3u8[^"]*)/)?.[1];
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
        const videoUrlPart = unpacked.match(/MDCore\.wurl=['"]([^'"]+)['"]/)?.[1];
        if (!videoUrlPart) return [];
        const videoUrl = videoUrlPart.startsWith("http") ? videoUrlPart : "https:" + videoUrlPart;
        return [{ url: videoUrl, quality: this._formatQuality(prefix, videoUrl, "Direct"), originalUrl: videoUrl, headers: this._getVideoHeaders(url) }];
    }
    async _doodstreamExtractor(url, prefix) {
        const res = await this.client.get(url, this.getHeaders(url));
        const pass_md5_path = res.body.substringAfter("'/pass_md5/").substringBefore("'");
        if (!pass_md5_path) return [];
        const pass_md5_url = new URL(url).origin + "/pass_md5/" + pass_md5_path;
        const doodtoken = Math.random().toString(36).substring(7);
        const video_url_res = await this.client.get(pass_md5_url, { headers: { "Referer": url } });
        const video_url = video_url_res.body + "z" + doodtoken + "?token=" + doodtoken;
        return [{ url: video_url, quality: this._formatQuality(prefix, video_url, "Direct"), originalUrl: video_url, headers: this._getVideoHeaders(url) }];
    }
    async _streamtapeExtractor(url, prefix) {
        const res = await this.client.get(url, this.getHeaders(url));
        const script = res.body.substringAfter("document.getElementById('robotlink')").substringBefore("</script>");
        if (!script) return [];
        const finalUrl = "https:" + script.substringAfter("innerHTML = '").substringBefore("'") + script.substringAfter("+ ('xcd").substringBefore("'");
        return [{ url: finalUrl, quality: this._formatQuality(prefix, finalUrl, "Direct"), originalUrl: finalUrl, headers: this._getVideoHeaders(url) }];
    }
    async _uqloadExtractor(url, prefix) {
        const res = await this.client.get(url, this.getHeaders(url));
        const videoUrl = res.body.substringAfter('sources: ["').substringBefore('"]');
        return videoUrl.startsWith("http") ? [{ url: videoUrl, quality: this._formatQuality(prefix, videoUrl, "Direct"), originalUrl: videoUrl, headers: this._getVideoHeaders("https://uqload.to/") }] : [];
    }
    
    // --- GENERIC FALLBACK EXTRACTOR ---
    async _allinoneExtractor(url, prefix) {
        try {
            const res = await this.client.get(url, this._getVideoHeaders(url));
            const body = res.body, doc = new Document(body), videoHeaders = this._getVideoHeaders(url);
            let sources = [];
            const directVideoSrc = doc.selectFirst("source[src]")?.getSrc || doc.selectFirst("video[src]")?.getSrc;
            if (directVideoSrc) sources.push(directVideoSrc);
            let potentialScripts = body;
            const packedScriptMatch = body.match(/eval\(function\(p,a,c,k,e,d\)\s?{.*}\)/);
            if (packedScriptMatch) try { potentialScripts += "\n" + unpackJs(packedScriptMatch[0]); } catch (e) {}
            const urlRegex = /(https?:\/\/[^"' \s]+\.(?:m3u8|mp4|webm|mkv|mov|flv|avi))[^"' \s]*/ig;
            let match;
            while ((match = urlRegex.exec(potentialScripts)) !== null) sources.push(match[0]);
            const uniqueSources = [...new Set(sources.filter(s => s && s.startsWith("http")))];
            const allVideos = [];
            for (const sourceUrl of uniqueSources) {
                if (sourceUrl.includes(".m3u8")) allVideos.push(...await this._parseM3U8(sourceUrl, prefix, videoHeaders));
                else allVideos.push({ url: sourceUrl, originalUrl: sourceUrl, quality: this._formatQuality(prefix, sourceUrl, "Direct"), headers: videoHeaders });
            }
            return allVideos;
        } catch (e) { return []; }
    }

    // --- FILTERS AND PREFERENCES ---
    getFilterList() {
        const categories = [{"name": "اختر", "query": ""}, {"name": "كل الافلام", "query": "/movies/"}, {"name": "افلام اجنبى", "query": "/category/افلام-اجنبي-3/"}, {"name": "افلام انمى", "query": "/category/افلام-انمي-1/"}, {"name": "افلام اسيويه", "query": "/category/افلام-اسيوي/"}, {"name": "افلام نتفليكس", "query": "/netflix-movies/"}, {"name": "سلاسل الافلام", "query": "/movies/"}, {"name": "الاعلي تقييما", "query": "/top-rating-imdb/"}, {"name": "مسلسلات اجنبى", "query": "/category/مسلسلات-اجنبي/"}, {"name": "مسلسلات اجنبى نتفليكس", "query": "/netflix-series/?cat=7"}, {"name": "مسلسلات اسيوية", "query": "/category/مسلسلات-اسيوية-7/"}, {"name": "مسلسلات اسيوية نتفليكس", "query": "/netflix-series/?cat=9"}, {"name": "مسلسلات انمي", "query": "/category/مسلسلات-انمي-1/"}, {"name": "مسلسلات انمي نتفلكس", "query": "/netflix-series/?cat=8"}, {"name": "احدث حلقات الانمي", "query": "/category/مسلسلات-انمي-1/?key=episodes"}];
        return [{type_name: "SelectFilter", name: "الأقسام", state: 0, values: categories.map(c => ({type_name: "SelectOption", name: c.name, value: c.query}))}];
    }
    getSourcePreferences() {
        return [{
            key: "preferred_quality",
            listPreference: {
                title: "الجودة المفضلة", summary: "اختر الجودة التي سيتم اختيارها تلقائيا", valueIndex: 1,
                entries: ["1080p", "720p", "480p"], entryValues: ["1080", "720", "480"],
            }
        }, {
            key: "hoster_selection",
            multiSelectListPreference: {
                title: "اختر السيرفرات", summary: "اختر السيرفرات التي تريد ان تظهر",
                entries: ["Vidtube", "Doodstream", "StreamWish", "Streamtape", "Lulustream", "Uqload", "Filemoon", "Mixdrop", "Other Embeds"],
                entryValues: ["vidtube", "dood", "streamwish", "streamtape", "lulustream", "uqload", "filemoon", "mixdrop", "other"],
                values: ["vidtube", "streamwish", "dood"],
            }
        }, {
            key: "show_video_url_in_quality",
            switchPreferenceCompat: {
                title: "إظهار رابط الفيديو (للتصحيح)", summary: "عرض رابط الفيديو النهائي بجانب اسم الجودة", value: false,
            }
        }, {
            key: "show_embed_url_in_quality",
            switchPreferenceCompat: {
                title: "إظهار رابط التضمين (للتصحيح)", summary: "عرض رابط التضمين الأولي بجانب اسم الجودة", value: false,
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
    try {
        let p = packedJS;
        const oldMatch = p.match(/eval\(function\(p,a,c,k,e,d\){.*}\((.*)\)\)/);
        if (oldMatch) {
            let args = oldMatch[1].split(',').map(arg => arg.trim());
            p = args[0].replace(/^'|'$/g, '');
            let a = parseInt(args[1]);
            let c = parseInt(args[2]);
            let k = args[3].replace(/^'|'$/g, '').split('|');
            while (c--) if (k[c]) p = p.replace(new RegExp('\\b' + c.toString(a) + '\\b', 'g'), k[c]);
            return p;
        }
    } catch (e) {}
    return packedJS;
}
