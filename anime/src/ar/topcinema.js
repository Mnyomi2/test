const mangayomiSources = [{
    "name": "Topcinema",
    "id": 645835682,
    "baseUrl": "https://web6.topcinema.cam",
    "lang": "ar",
    "typeSource": "single",
    "iconUrl": "https://www.google.com/s2/favicons?sz=128&domain=https://web6.topcinema.cam",
    "itemType": 1,
    "version": "1.0.1",
    "pkgPath": "anime/src/ar/topcinema.js",
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
        this._allSources = mangayomiSources; 
        this.source.baseUrl = this.source.baseUrl.trim();
    }

    getPreference(key) {
        return new SharedPreferences().get(key);
    }

    async requestDoc(path, headers = {}) {
        const url = this.source.baseUrl + path;
        const res = await this.client.get(url, { headers });
        return new Document(res.body);
    }

    async request(url, headers = {}) {
        const res = await this.client.get(url, { headers });
        return res;
    }

    /**
     * وظيفة شاملة لتنظيف وتنسيق عناوين الأفلام والمسلسلات.
     * تطبق سلسلة من القواعد لجعل العناوين موجزة ومتسقة.
     * @param {string} title العنوان الأصلي المراد معالجته.
     * @returns {string} العنوان بعد التنظيف والتنسيق.
     */
    _titleEdit(title) { 
        let editedTitle = title ? title.trim() : ""; 
        if (!editedTitle) return editedTitle;

        const arabicSeasonMap = {
            "الاول": "1", "الثاني": "2", "الثالث": "3", "الرابع": "4", "الخامس": "5",
            "السادس": "6", "السابع": "7", "الثامن": "8", "التاسع": "9", "العاشر": "10",
            "الحادي عشر": "11", "الثاني عشر": "12", "الثالث عشر": "13", "الرابع عشر": "14", "الخامس عشر": "15"
        };

        let extractedYear = '';
        editedTitle = editedTitle.replace(/(\b\d{4}\b)/, (match, p1) => {
            extractedYear = p1; 
            return ''; 
        });

        editedTitle = editedTitle.replace(/^(?:فيلم|عرض|مسلسل|برنامج|انمي)\s+/, '');
        editedTitle = editedTitle.replace(/\s+والاخيرة\b/g, ' End'); 

        for (const key in arabicSeasonMap) {
            const regex = new RegExp(`الموسم\\s*${key}\\b`, 'g'); 
            editedTitle = editedTitle.replace(regex, `الموسم ${arabicSeasonMap[key]}`);
        }
        editedTitle = editedTitle.replace(/الموسم\s*(\d+)/g, 's$1');

        editedTitle = editedTitle.replace(/الحلقة\s*(\d{3,})/g, 's$1');
        editedTitle = editedTitle.replace(/الحلقة\s*(\d+)/g, 'ep $1');

        editedTitle = editedTitle.replace(/\s+(?:مترجم|مترجمة|اون لاين)\s*$/, '');
        editedTitle = editedTitle.replace(/\s+/g, ' ');

        if (extractedYear) {
            editedTitle += ` ${extractedYear}`;
        }

        return editedTitle.trim();
    }

    /**
     * وظيفة مساعدة لجلب ومعالجة عناصر القائمة (الأفلام والمسلسلات).
     * إذا كان العنصر مسلسلًا، فإنه يقوم بطلب صفحة تفاصيله لجلب مواسمه وعرضها كعناصر منفصلة.
     * @param {Document} doc وثيقة HTML للصفحة الحالية.
     * @returns {Promise<Array<any>>} مصفوفة بالعناصر المعالجة (أفلام أو مواسم مسلسلات).
     */
    async _processListingItems(doc) {
        const list = [];
        const items = doc.select("div.Block--Item, div.Small--Box");
        const imageAttr = "data-src"; 

        for (const item of items) { 
            const linkElement = item.selectFirst("a");
            if (!linkElement) continue;

            const link = linkElement.getHref;
            // محاولة استخراج العنوان لعناصر القائمة الرئيسية
            const rawTitle = linkElement.attr("title") || item.selectFirst("h3.title")?.text;
            const name = this._titleEdit(rawTitle); 
            const imageUrl = item.selectFirst("img")?.attr(imageAttr);

            if (link.includes('/series/')) {
                try {
                    const seriesDetailPageDoc = await this.requestDoc(link.replace(this.source.baseUrl, ''));
                    const seasonElements = seriesDetailPageDoc.select("section.allseasonss div.Small--Box.Season");

                    if (seasonElements.length > 0) {
                        for (const seasonItem of seasonElements) {
                            const seasonLinkElement = seasonItem.selectFirst("a");
                            if (!seasonLinkElement) continue;

                            // ***** التعديل هنا: محاولة استخراج العنوان لعناصر المواسم *****
                            // أولاً من 'title' لعنصر الرابط، ثم من نص 'h3.title' داخل عنصر الموسم إذا وجد
                            const seasonRawTitle = seasonLinkElement.attr("title") || seasonItem.selectFirst("h3.title")?.text;
                            const seasonName = this._titleEdit(seasonRawTitle);
                            // **********************************************************

                            const seasonImageUrl = seasonItem.selectFirst("img")?.attr(imageAttr); 
                            const seasonLink = seasonLinkElement.getHref;

                            list.push({ name: seasonName, imageUrl: seasonImageUrl, link: seasonLink });
                        }
                    } else {
                        // في حال عدم العثور على مواسم (ندرة أو خطأ في الهيكل)، أضف العنصر الرئيسي للمسلسل كخيار احتياطي
                        list.push({ name, imageUrl, link });
                    }
                } catch (error) {
                    console.error(`Error processing series ${name} (${link}):`, error);
                    list.push({ name, imageUrl, link });
                }
            } else {
                list.push({ name, imageUrl, link });
            }
        }
        return list;
    }

    async getPopular(page) {
        const doc = await this.requestDoc(`/movies/page/${page}/`); 
        const list = await this._processListingItems(doc); 
        const hasNextPage = !!doc.selectFirst("div.pagination ul.page-numbers li a.next");
        return { list, hasNextPage };
    }

    async getLatestUpdates(page) {
        const doc = await this.requestDoc(`/recent/page/${page}/`);
        const list = await this._processListingItems(doc); 
        const hasNextPage = !!doc.selectFirst("div.pagination ul.page-numbers li a.next");
        return { list, hasNextPage };
    }

    async search(query, page, filters) {
        let path;
        const categoryFilter = filters[0];   

        if (query) {
            const offset = page - 1; 
            path = `/search/?query=${encodeURIComponent(query)}&type=all&offset=${offset}`; 
        } else {
            const selectedCategory = categoryFilter.values[categoryFilter.state].value;

            if (selectedCategory) {
                let basePath = selectedCategory; 
                
                if (basePath.includes('?')) {
                    const parts = basePath.split('?');
                    const mainPathSegment = parts[0].endsWith('/') ? parts[0] : parts[0] + '/';
                    const queryString = parts[1];
                    path = `${mainPathSegment}page/${page}/?${queryString}`;
                } else {
                    basePath = basePath.endsWith('/') ? basePath : basePath + '/'; 
                    path = `${basePath}page/${page}/`;
                }
            } else {
                return this.getPopular(page);
            }
        }

        const doc = await this.requestDoc(path); 
        const list = await this._processListingItems(doc); 
        const hasNextPage = !!doc.selectFirst("div.pagination ul.page-numbers li a.next");
        return { list, hasNextPage };
    }

    async getDetail(url) {
        const doc = await this.requestDoc(url.replace(this.source.baseUrl, '')); 

        const nameElement = doc.selectFirst("h1.post-title");
        const name = this._titleEdit(nameElement?.text || "Unknown Title"); 
        const imageUrl = doc.selectFirst("div.left div.image img")?.getSrc;
        const description = doc.selectFirst("div.story")?.text.trim();
        const genre = doc.select("div.catssection li a").map(e => e.text);
        const status = 1; 

        const chapters = [];
        const episodeElements = doc.select("section.allepcont div.row a");

        if (episodeElements.length > 0) {
            const sortedEpisodes = [...episodeElements].sort((a, b) => {
                const numA = parseInt(a.selectFirst("div.epnum")?.text.replace(/\D/g, '').trim() || '0');
                const numB = parseInt(b.selectFirst("div.epnum")?.text.replace(/\D/g, '').trim() || '0');
                return numA - numB;
            });

            sortedEpisodes.forEach(ep => {
                const epUrl = ep.getHref + "watch/";
                const epTitleAttribute = ep.attr("title"); 

                if (epTitleAttribute) {
                    const cleanEpName = this._titleEdit(epTitleAttribute);
                    chapters.push({ name: cleanEpName, url: epUrl });
                }
            });
        }
        else { 
            chapters.push({ name: this._titleEdit("مشاهدة"), url: url + "watch/" }); 
        }

        return { name, imageUrl, description, genre, status, chapters, link: url };
    }

    async getVideoList(url) {
        const doc = await this.requestDoc(url.replace(this.source.baseUrl, ''));
        const serverElements = doc.select("div.watch--servers--list ul li.server--item");

        let videos = [];
        for (const element of serverElements) {
            const extracted = await this._extractVideos(element);
            if (extracted && extracted.length > 0) videos.push(...extracted);
        }

        const preferredQuality = this.getPreference("preferred_quality") || "720";
        videos.sort((a, b) => {
            const aPreferred = a.quality.includes(preferredQuality);
            const bPreferred = b.quality.includes(preferredQuality);
            if (aPreferred && !bPreferred) return -1;
            if (!aPreferred && bPreferred) return 1;
            return 0; 
        });

        return videos;
    }

    async _extractVideos(element) {
        const serverUrl = element.attr("data-link");
        const serverName = element.text;
        const urlHost = new URL(serverUrl).hostname; 

        const defaultHeaders = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.75 Safari/537.36",
        };

        if (urlHost.includes("cybervynx.com") || urlHost.includes("smoothpre.com")) {
            return await this._resolveCybervynxSmoothpre(serverUrl, serverName, defaultHeaders);
        }
        if (urlHost.includes("doodstream.com") || urlHost.includes("dood.to") || urlHost.includes("dood.so") || urlHost.includes("dood.cx") || urlHost.includes("dood.la") || urlHost.includes("dood.ws") || urlHost.includes("dood.sh") || urlHost.includes("doodstream.co") || urlHost.includes("dood.pm") || urlHost.includes("dood.wf") || urlHost.includes("dood.re") || urlHost.includes("dood.yt") || urlHost.includes("dooood.com") || urlHost.includes("dood.stream") || urlHost.includes("ds2play.com") || urlHost.includes("doods.pro") || urlHost.includes("ds2video.com") || urlHost.includes("d0o0d.com") || urlHost.includes("do0od.com") || urlHost.includes("d0000d.com") || urlHost.includes("d000d.com") || urlHost.includes("dood.li") || urlHost.includes("dood.work") || urlHost.includes("dooodster.com") || urlHost.includes("vidply.com")) {
            return await this._resolveDoodStream(serverUrl, defaultHeaders);
        }
        if (urlHost.includes("mixdrop.ps") || urlHost.includes("mixdrop.co") || urlHost.includes("mixdrop.to") || urlHost.includes("mixdrop.sx") || urlHost.includes("mixdrop.bz") || urlHost.includes("mixdrop.ch") || urlHost.includes("mixdrp.co") || urlHost.includes("mixdrp.to") || urlHost.includes("mixdrop.gl") || urlHost.includes("mixdrop.club") || urlHost.includes("mixdroop.bz") || urlHost.includes("mixdroop.co") || urlHost.includes("mixdrop.vc") || urlHost.includes("mixdrop.ag") || urlHost.includes("mdy48tn97.com") || urlHost.includes("md3b0j6hj.com") || urlHost.includes("mdbekjwqa.pw") || urlHost.includes("mdfx9dc8n.net") || urlHost.includes("mixdropjmk.pw") || urlHost.includes("mixdrop21.net") || urlHost.includes("mixdrop.is") || urlHost.includes("mixdrop.si") || urlHost.includes("mixdrop23.net") || urlHost.includes("mixdrop.nu") || urlHost.includes("mixdrop.ms") || urlHost.includes("mdzsmutpcvykb.net") || urlHost.includes("mxdrop.to")) {
            return await this._resolveMixDrop(serverUrl, defaultHeaders);
        }
        return []; 
    }

    async _jsUnpack(packedJS) {
        try {
            const p_match = packedJS.match(/eval\(function\(p,a,c,k,e,d\){.*?}\('([^']+)',(\d+),(\d+),'([^']+)'\.split\('\|'\),0,{}\)\)/s);
            if (!p_match) {
                console.warn("JS Unpack: No p,a,c,k,e,d pattern found for unpacking.");
                return null;
            }

            let p = p_match[1];
            let a = parseInt(p_match[2]);
            let c = parseInt(p_match[3]);
            let k = p_match[4].split('|');

            let e = function(val) {
                return (val < a ? "" : e(parseInt(val / a))) + ((val = val % a) > 35 ? String.fromCharCode(val + 29) : val.toString(36));
            };

            let unpacked = p;
            let i = c;

            while (i--) {
                if (k[i]) {
                    unpacked = unpacked.replace(new RegExp('\\b' + e(i) + '\\b', 'g'), k[i]);
                }
            }
            return unpacked;
        } catch (error) {
            console.error("Error during JS Unpack:", error);
            return null;
        }
    }

    async _parseM3U8(m3u8Content, baseUrl, prefix) {
        const videos = [];
        const lines = m3u8Content.split('\n');
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
                const resolutionMatch = lines[i].match(/RESOLUTION=(\d+x\d+)/);
                const quality = resolutionMatch ? resolutionMatch[1] : 'Unknown';
                const videoUrl = new URL(lines[i + 1], baseUrl).href;
                videos.push({
                    url: videoUrl,
                    originalUrl: videoUrl,
                    quality: `${prefix} - ${quality}`, 
                });
            }
        }
        if (videos.length === 0 && m3u8Content.includes('.m3u8')) {
             videos.push({
                 url: baseUrl,
                 originalUrl: baseUrl,
                 quality: `${prefix} - Auto`, 
             });
        }
        return videos;
    }

    async _resolveCybervynxSmoothpre(url, prefix, headers) {
        try {
            const res = await this.request(url, headers);
            const scriptData = res.body.match(/eval\(function\(p,a,c,k,e,d\).*\)/s)?.[0];

            if (!scriptData) {
                const directMp4Match = res.body.match(/src="([^"]+\.mp4)"/)?.[1];
                if (directMp4Match) {
                     return [{ url: directMp4Match, originalUrl: url, quality: `${prefix} - SD` }];
                }
                const directM3u8Match = res.body.match(/(https?:\/\/[^"]+\.m3u8)/)?.[1];
                if (directM3u8Match) {
                    const m3u8Res = await this.request(directM3u8Match, { "Referer": url });
                    return this._parseM3U8(m3u8Res.body, directM3u8Match, prefix);
                }
                return [];
            }

            const unpacked = await this._jsUnpack(scriptData);
            if (!unpacked) return [];

            const mp4Match = unpacked.match(/file:"([^"]+\.mp4)"/)?.[1];
            if (mp4Match) {
                return [{ url: mp4Match, originalUrl: url, quality: `${prefix} - SD` }];
            }

            const masterUrl = unpacked.match(/file:"([^"]+\.m3u8)"/)?.[1];
            if (masterUrl) {
                const m3u8Res = await this.request(masterUrl, { "Referer": url });
                return this._parseM3U8(m3u8Res.body, masterUrl, prefix);
            }
            return [];
        } catch (error) {
            console.error(`Error resolving ${prefix} (${url}):`, error);
            return [];
        }
    }

    async _resolveDoodStream(url, headers) {
        try {
            let currentHost = new URL(url).hostname;
            if (currentHost.includes("dood.cx") || currentHost.includes("dood.wf")) {
                currentHost = "dood.so";
            }
            if (currentHost.includes("dood.la") || currentHost.includes("dood.yt")) {
                currentHost = "doodstream.com";
            }

            let embedId = url.split('/').pop();
            if (!embedId || embedId.length < 5) {
                 const matchId = url.match(/(?:\/d\/|\/e\/)([0-9a-zA-Z]+)/);
                 if (matchId) embedId = matchId[1];
            }
            if (!embedId) {
                console.warn("DoodStream: Could not extract embed ID from URL:", url);
                return [];
            }
            const embedUrl = `https://${currentHost}/e/${embedId}`;

            let doodHeaders = { ...headers, "Referer": `https://${currentHost}/` };

            let res = await this.client.get(embedUrl, { headers: doodHeaders });
            let html = res.body;

            const match = html.match(/dsplayer\.hotkeys[^']+'([^']+).+?function\s*makePlay.+?return[^?]+([^"]+)/s);
            if (match) {
                const urlPart1 = match[1];
                const tokenPart2 = match[2];
                
                const playUrl = new URL(urlPart1, embedUrl).href;
                doodHeaders.Referer = embedUrl;

                const playRes = await this.client.get(playUrl, { headers: doodHeaders });
                const playHtml = playRes.body;

                let vidSrc;
                if (playHtml.includes("cloudflarestorage.")) {
                    vidSrc = playHtml.trim();
                } else {
                    const charSet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
                    let randomString = '';
                    for (let i = 0; i < 10; i++) {
                        randomString += charSet.charAt(Math.floor(Math.random() * charSet.length));
                    }
                    vidSrc = playHtml.trim() + tokenPart2 + Date.now() + randomString;
                }

                return [{
                    url: vidSrc,
                    originalUrl: embedUrl,
                    quality: `Doodstream`
                }];
            }
            return [];
        } catch (error) {
            console.error(`Error resolving DoodStream (${url}):`, error);
            return [];
        }
    }

    async _resolveMixDrop(url, headers) {
        try {
            let currentHost = new URL(url).hostname;
            if (currentHost.includes(".club")) {
                currentHost = currentHost.replace(".club", ".co");
            }
            
            const matchId = url.match(/(?:\/e\/)([0-9a-zA-Z]+)/);
            if (!matchId) {
                console.warn("MixDrop: Could not extract embed ID from URL:", url);
                return [];
            }
            const embedId = matchId[1];
            let embedUrl = `https://${currentHost}/e/${embedId}`;

            let mixdropHeaders = { ...headers, "Origin": `https://${currentHost}`, "Referer": `https://${currentHost}/` };

            let res = await this.client.get(embedUrl, { headers: mixdropHeaders });
            let html = res.body;

            const redirectMatch = html.match(/location\s*=\s*["']([^'"]+)/);
            if (redirectMatch) {
                const newPath = redirectMatch[1];
                mixdropHeaders.Referer = embedUrl;
                const redirectedEmbedUrl = new URL(newPath, embedUrl).href;
                res = await this.client.get(redirectedEmbedUrl, { headers: mixdropHeaders });
                html = res.body;
                embedUrl = redirectedEmbedUrl;
            }

            if (html.includes('(p,a,c,k,e,d)')) {
                const scriptData = html.match(/eval\(function\(p,a,c,k,e,d\).*\)/s)?.[0];
                if (scriptData) {
                    html = await this._jsUnpack(scriptData) || html;
                }
            }

            const surlMatch = html.match(/(?:vsr|wurl|surl)[^=]*=\s*"([^"]+)/);
            if (surlMatch) {
                let surl = surlMatch[1];
                if (surl.startsWith('//')) {
                    surl = 'https:' + surl;
                }
                
                return [{
                    url: surl,
                    originalUrl: embedUrl,
                    quality: `MixDrop`
                }];
            }
            return [];
        } catch (error) {
            console.error(`Error resolving MixDrop (${url}):`, error);
            return [];
        }
    }

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
        },
        {
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
                summary: "اختر الجودة المفضلة لديك",
                valueIndex: 0,
                entries: ["720p", "480p", "360p", "Auto"], 
                entryValues: ["720", "480", "360", "Auto"], 
            }
        }];
    }
}

new DefaultExtension();
