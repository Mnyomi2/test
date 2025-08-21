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

        // Normalize different types of hyphens/dashes
        editedTitle = editedTitle.replace(/[\u2013\u2014\u2015\u2212]/g, '-');

        // 1. Remove content within parentheses and square brackets, along with surrounding spaces.
        // This targets common irrelevant data like quality, source tags, etc.
        editedTitle = editedTitle.replace(/\s*\(.*?\)\s*/g, ' ');
        editedTitle = editedTitle.replace(/\s*\[.*?\]\s*/g, ' ');

        // 2. Extract and remove a 4-digit year if present (e.g., "Movie Title 2023").
        // The year will be appended at the end in parentheses if found.
        let extractedYear = '';
        editedTitle = editedTitle.replace(/\b(\d{4})\b/, (match, p1) => {
            extractedYear = p1;
            return ''; // Remove the year from the title for further processing
        });

        // 3. Remove common Arabic prefixes like "فيلم", "مسلسل", "عرض", "برنامج", "انمي"
        // These prefixes indicate the type of media and are often redundant in a standardized display.
        editedTitle = editedTitle.replace(/^(?:فيلم|عرض|مسلسل|برنامج|انمي)\s+/i, '');

        // 4. Map Arabic season words (e.g., "الاول", "الثاني") to their numeric equivalents.
        // This makes season numbering consistent (e.g., "الموسم 1").
        const arabicSeasonMap = {
            "الاول": "1", "الثاني": "2", "الثالث": "3", "الرابع": "4", "الخامس": "5",
            "السادس": "6", "السابع": "7", "الثامن": "8", "التاسع": "9", "العاشر": "10",
            "الحادي عشر": "11", "الثاني عشر": "12", "الثالث عشر": "13", "الرابع عشر": "14", "الخامس عشر": "15",
            "السادس عشر": "16", "السابع عشر": "17", "الثامن عشر": "18", "التاسع عشر": "19", "العشرون": "20",
            "الحادي والعشرون": "21", "الثاني والعشرون": "22", "الثالث والعشرون": "23", "الرابع والعشرون": "24", "الخامس والعشرون": "25",
            "السادس والعشرون": "26", "السابع والعشرون": "27", "الثامن والعشرون": "28", "التاسع والعشرون": "29", "الثلاثون": "30",
            // Add more if necessary for higher season numbers
        };

        for (const key in arabicSeasonMap) {
            // Use word boundary `\b` to match the full word and `(?:ال)*` to handle optional "ال" (the) prefix
            const regex = new RegExp(`الموسم\\s*(?:ال)*${key}\\b`, 'g'); 
            editedTitle = editedTitle.replace(regex, `الموسم ${arabicSeasonMap[key]}`);
        }
        // Convert "الموسم N" to standard "sN" format (e.g., "s1", "s2").
        editedTitle = editedTitle.replace(/الموسم\s*(\d+)/g, 's$1');

        // 5. Handle episode formatting: Convert "الحلقة N" to "E N" or "E<padded_N>".
        // This ensures consistent episode numbering (e.g., "E1", "E15", "E23").
        editedTitle = editedTitle.replace(/الحلقة\s*(\d+)/g, (match, p1) => {
            const episodeNumber = parseInt(p1, 10); // Convert to integer to handle leading zeros if any
            return `E${episodeNumber}`; // Format as E1, E2, etc.
        });

        // 6. Remove common suffixes, descriptive terms, and quality tags.
        // These are often redundant and can clutter the main title.
        editedTitle = editedTitle.replace(
            /\s+(?:مترجم|مترجمة|مدبلج|مدبلجة|اون لاين|اونلاين|كامل|بجودة عالية|جودة عالية|شاشة كاملة|حصريا|حصري|الاصلي|نسخة اصلية|برابط مباشر|للمشاهدة|المشاهدة|مشاهدة|جودات متعددة|جودات|والاخيرة)\s*$/gi,
            ''
        );
        editedTitle = editedTitle.replace(
            /\b(?:HD|4K|FHD|UHD|HDRip|BluRay|WEB-DL|BRRip|DVDRip|HDTV|x264|x265|AAC|EAC3|DDP|5\.1|7\.1|اتش دي|720p|1080p|2160p|h\.264|h\.265)\b/gi,
            ''
        );
        // Remove "End" if it was added from "والاخيرة" (not needed with the new suffix removal).
        editedTitle = editedTitle.replace(/\s+End\b/gi, '');


        // 7. Normalize multiple spaces to a single space.
        // This cleans up any extra spaces left after replacements.
        editedTitle = editedTitle.replace(/\s+/g, ' ');

        // 8. Append the extracted year back to the end of the title, in parentheses.
        if (extractedYear) {
            editedTitle += ` (${extractedYear})`;
        }

        // 9. Final trim to remove any leading/trailing spaces.
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
                const epUrl = ep.getHref; // Base URL for the episode's detail page
                const epTitleAttribute = ep.attr("title"); 

                if (epTitleAttribute) {
                    const cleanEpName = this._titleEdit(epTitleAttribute);
                    // Append "watch/" to the episode URL to get to the watch page
                    chapters.push({ name: cleanEpName, url: epUrl + "watch/" }); 
                }
            });
        }
        else { 
            // For single movies or cases where episodes aren't listed
            chapters.push({ name: this._titleEdit("مشاهدة"), url: url + "watch/" }); 
        }

        return { name, imageUrl, description, genre, status, chapters, link: url };
    }

    async getVideoList(url) {
        const videos = [];
        const defaultHeaders = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.75 Safari/537.36",
        };

        let watchPageUrl = '';
        let downloadPageUrl = '';

        // Determine if the incoming URL is a watch page, download page, or a detail page.
        // The getDetail function passes ".../watch/" URLs.
        if (url.endsWith('/watch/')) {
            watchPageUrl = url;
            downloadPageUrl = url.replace('/watch/', '/download/');
        } else if (url.endsWith('/download/')) {
            // If getVideoList is somehow called directly with a download URL, handle it.
            downloadPageUrl = url;
            // We can't reliably derive the watch page from a download page URL without fetching the detail page first.
            // For now, we'll assume it's just a download request in this scenario.
        } else {
            // If it's a detail page URL (e.g., .../episode-title/),
            // this is less common for getVideoList but handled.
            watchPageUrl = url + 'watch/';
            downloadPageUrl = url + 'download/';
        }

        // --- Path A: Process the WATCH page for streaming servers (if applicable) ---
        if (watchPageUrl) {
            try {
                const watchDoc = await this.requestDoc(watchPageUrl.replace(this.source.baseUrl, ''), defaultHeaders);

                // Extract streaming servers
                const serverElements = watchDoc.select("div.watch--servers--list ul li.server--item");
                for (const element of serverElements) {
                    const extracted = await this._extractVideos(element);
                    if (extracted && extracted.length > 0) videos.push(...extracted);
                }
            } catch (error) {
                console.warn(`Error processing watch page ${watchPageUrl}:`, error);
                // Continue to try the download page even if watch page fails
            }
        }

        // --- Path B: Process the DOWNLOAD page for direct download links (if applicable) ---
        if (downloadPageUrl) {
            try {
                // Get preferred download servers from preferences
                const preferredDownloadServers = this.getPreference("preferred_download_servers") || [];

                // Use the watchPageUrl as referer if available, otherwise the original 'url' (which could be the downloadPageUrl itself)
                const downloadDoc = await this.requestDoc(downloadPageUrl.replace(this.source.baseUrl, ''), { "Referer": watchPageUrl || url });
                
                // Process VidTube links (multi-quality download server)
                const proServerLinks = downloadDoc.select("div.proServer a.downloadsLink.proServer");
                
                // Only process VidTube if it's in the preferred list
                if (preferredDownloadServers.includes("vidtube")) {
                    for (const proLink of proServerLinks) {
                        const proServerUrl = proLink.getHref;
                        if (proServerUrl.includes("vidtube.pro")) {
                            console.log(`Debug: Found VidTube proServer link: ${proServerUrl}`);
                            const vidtubeVideos = await this._resolveVidTubeDownloadPage(proServerUrl, { "Referer": downloadPageUrl });
                            if (vidtubeVideos && vidtubeVideos.length > 0) {
                                videos.push(...vidtubeVideos);
                            }
                        }
                    }
                }

                // Process other direct download links by quality block
                const downloadBlocks = downloadDoc.select("div.DownloadBlock");
                for (const block of downloadBlocks) {
                    const qualityTitle = block.selectFirst("h2.download-title span")?.text.trim(); // e.g., "1080p"
                    const downloadItems = block.select("ul.download-items li a.downloadsLink");
                    for (const downloadItem of downloadItems) {
                        const downloadUrl = downloadItem.getHref;
                        const hostNameText = downloadItem.selectFirst("div.text span")?.text.trim(); // e.g., "UpDown"
                        const itemQuality = downloadItem.selectFirst("div.text p")?.text.trim(); // e.g., "1080p"

                        let serverKey = '';
                        // Map display name to preference key
                        if (hostNameText) {
                            switch (hostNameText.toLowerCase()) {
                                case 'updown': serverKey = 'updown'; break;
                                case 'bowfile': serverKey = 'bowfile'; break;
                                case 'mdiaload': serverKey = 'mdiaload'; break;
                                case 'ddownload': serverKey = 'ddownload'; break;
                                case 'nitroflare': serverKey = 'nitroflare'; break;
                                case '1fichier': serverKey = '1fichier'; break;
                                case 'rapidgator': serverKey = 'rapidgator'; break;
                                case 'savefiles': serverKey = 'savefiles'; break;
                                case 'cloudfile': serverKey = '1cloudfile'; break;
                                default: serverKey = ''; break; // Unknown server
                            }
                        }
                        
                        // Only add if the server's key is in the preferred list
                        if (downloadUrl && preferredDownloadServers.includes(serverKey)) {
                            console.log(`Debug: Adding direct download link: ${hostNameText} - ${itemQuality || qualityTitle}`);
                            videos.push({
                                url: downloadUrl,
                                originalUrl: downloadUrl,
                                quality: `${hostNameText || 'Direct'} - ${itemQuality || qualityTitle || 'Unknown'} (${downloadUrl})`.trim()
                            });
                        }
                    }
                }
            } catch (error) {
                console.warn(`Error processing download page ${downloadPageUrl}:`, error);
            }
        }

        // --- Step 3: Sort videos by preferred quality ---
        const preferredQuality = this.getPreference("preferred_quality") || "720";
        videos.sort((a, b) => {
            const aPreferred = a.quality.includes(preferredQuality);
            const bPreferred = b.quality.includes(preferredQuality);
            if (aPreferred && !bPreferred) return -1;
            if (!aPreferred && bPreferred) return 1;
            return 0; 
        });

        console.log("Debug: Final video list before return:", videos);
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

    // Helper for VidTube multi-quality download page (e.g., https://vidtube.pro/d/vdr56366sevq.html)
    async _resolveVidTubeDownloadPage(vidtubeHtmlPageUrl, headers = {}) {
        const videos = [];
        try {
            console.log(`Debug: Fetching VidTube multi-quality page: ${vidtubeHtmlPageUrl} with Referer: ${headers.Referer}`);
            const res = await this.client.get(vidtubeHtmlPageUrl, { headers });
            const doc = new Document(res.body);

            const downloadOptions = doc.select("div.row.mb-3.justify-content-center a.btn.btn-light");
            const baseUrl = new URL(vidtubeHtmlPageUrl).origin; // Get base URL for relative paths

            for (const option of downloadOptions) {
                const relativeLink = option.getHref; // e.g., "/d/vdr56366sevq_x"
                const fullLink = `${baseUrl}${relativeLink}`;
                // Extract quality from the bold text or the small muted text
                const qualityText = option.selectFirst("b.text-primary")?.text.trim() || option.selectFirst("span.small.text-muted")?.text.trim();
                
                if (fullLink) {
                    // Pass the VidTube origin as Referer to the next step, matching browser console behavior
                    const nextHeaders = { ...headers, "Referer": new URL(fullLink).origin + "/" }; // Referer: https://vidtube.pro/
                    console.log(`Debug: Found VidTube quality option: ${qualityText} -> ${fullLink}`);
                    const directVideo = await this._resolveVidTubeDirectLink(fullLink, qualityText, nextHeaders);
                    if (directVideo) {
                        videos.push(directVideo);
                    }
                }
            }
        } catch (error) {
            console.error(`Error resolving VidTube download options from ${vidtubeHtmlPageUrl}:`, error);
        }
        return videos;
    }

    // Helper for VidTube direct link page (e.g., https://vidtube.pro/d/vdr56366sevq_x)
    async _resolveVidTubeDirectLink(vidtubeDirectLinkUrl, quality, headers = {}) {
        try {
            console.log(`Debug: Fetching VidTube direct link page: ${vidtubeDirectLinkUrl} with Referer: ${headers.Referer}`);
            const res = await this.client.get(vidtubeDirectLinkUrl, { headers });
            const doc = new Document(res.body);

            const directLinkElement = doc.selectFirst("a.btn.btn-gradient.submit-btn");
            if (directLinkElement) {
                const finalVideoUrl = directLinkElement.getHref;
                if (finalVideoUrl) {
                    const videoObject = {
                        url: finalVideoUrl,
                        originalUrl: vidtubeDirectLinkUrl,
                        quality: `VidTube - ${quality || 'Auto'} (${finalVideoUrl})` // Include final URL
                    };
                    console.log("Debug: Successfully extracted VidTube video:", videoObject);
                    return videoObject;
                }
            }
            // Fallback if directLinkElement or finalVideoUrl is not found
            console.warn(`Debug: Failed to find final video URL on VidTube page: ${vidtubeDirectLinkUrl}. Returning fallback.`);
            return {
                url: vidtubeDirectLinkUrl, // Fallback URL: the page URL itself
                originalUrl: vidtubeDirectLinkUrl,
                quality: `VidTube - ${quality || 'Auto'} (No Direct Link Found - ${vidtubeDirectLinkUrl})`
            };
        } catch (error) {
            console.error(`Error resolving VidTube final link from ${vidtubeDirectLinkUrl}:`, error);
            // Fallback on network error
            return {
                url: vidtubeDirectLinkUrl, // Fallback URL: the page URL itself
                originalUrl: vidtubeDirectLinkUrl,
                quality: `VidTube - ${quality || 'Auto'} (Error - ${vidtubeDirectLinkUrl})`
            };
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
                value: "720", // Explicitly setting the default value to "720" (for 720p)
                entries: ["720p", "480p", "360p", "Auto"], 
                entryValues: ["720", "480", "360", "Auto"], 
            }
        }, {
            key: "preferred_download_servers",
            multiSelectListPreference: {
                title: "سيرفرات التحميل المفضلة",
                summary: "اختر سيرفرات التحميل التي تفضل ظهورها. (تنطبق فقط على روابط التحميل المباشر).",
                // Defaulting to all of them selected.
                values: [
                    "vidtube", "updown", "bowfile", "mdiaload", "ddownload", "nitroflare",
                    "1fichier", "rapidgator", "savefiles", "1cloudfile"
                ],
                entries: [
                    "VidTube (متعدد الجودات)", "UpDown", "BowFile", "Mdiaload", "DDownload", "Nitroflare",
                    "1Fichier", "Rapidgator", "Savefiles", "CloudFile"
                ],
                entryValues: [
                    "vidtube", "updown", "bowfile", "mdiaload", "ddownload", "nitroflare",
                    "1fichier", "rapidgator", "savefiles", "1cloudfile"
                ],
            }
        }];
    }
}

new DefaultExtension();
