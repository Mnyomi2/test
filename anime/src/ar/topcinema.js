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
            "الحادي عشر": "11", "الثاني عشر": "12", "الثالث عشر": "13", "الرابع عشر": "14", "الخامس عشر": "15",
            "السادس عشر": "16", "السابع عشر": "17", "الثامن عشر": "18", "التاسع عشر": "19", "العشرون": "20",
            "الحادي والعشرون": "21", "الثاني والعشرون": "22", "الثالث والعشرون": "23", "الرابع والعشرون": "24", "الخامس والعشرون": "25",
            "السادس والعشرون": "26", "السابع والعشرون": "27", "الثامن والعشرون": "28", "التاسع والعشرون": "29", "الثلاثون": "30",
        };

        // Normalize different types of hyphens/dashes
        editedTitle = editedTitle.replace(/[\u2013\u2014\u2015\u2212]/g, '-');

        // 1. Remove content within parentheses and square brackets.
        editedTitle = editedTitle.replace(/\s*\(.*?\)\s*/g, ' ');
        editedTitle = editedTitle.replace(/\s*\[.*?\]\s*/g, ' ');

        // 2. Extract and remove a 4-digit year if present.
        let extractedYear = '';
        editedTitle = editedTitle.replace(/\b(\d{4})\b/, (match, p1) => {
            extractedYear = p1;
            return ''; 
        });

        // 3. Remove common Arabic prefixes.
        editedTitle = editedTitle.replace(/^(?:فيلم|عرض|مسلسل|برنامج|انمي)\s+/i, '');

        // 4. Map Arabic season words to numeric, then to "sN" format.
        for (const key in arabicSeasonMap) {
            const regex = new RegExp(`الموسم\\s*(?:ال)*${key}\\b`, 'g'); 
            editedTitle = editedTitle.replace(regex, `الموسم ${arabicSeasonMap[key]}`);
        }
        editedTitle = editedTitle.replace(/الموسم\s*(\d+)/g, 's$1');

        // 5. Handle episode formatting: Convert "الحلقة N" to "E N".
        editedTitle = editedTitle.replace(/الحلقة\s*(\d+)/g, (match, p1) => {
            const episodeNumber = parseInt(p1, 10);
            return `E${episodeNumber}`;
        });

        // 6. Remove common suffixes, descriptive terms, and quality tags.
        editedTitle = editedTitle.replace(
            /\s+(?:مترجم|مترجمة|مدبلج|مدبلجة|اون لاين|اونلاين|كامل|بجودة عالية|جودة عالية|شاشة كاملة|حصريا|حصري|الاصلي|نسخة اصلية|برابط مباشر|للمشاهدة|المشاهدة|مشاهدة|جودات متعددة|جودات|والاخيرة)\s*$/gi,
            ''
        );
        editedTitle = editedTitle.replace(
            /\b(?:HD|4K|FHD|UHD|HDRip|BluRay|WEB-DL|BRRip|DVDRip|HDTV|x264|x265|AAC|EAC3|DDP|5\.1|7\.1|اتش دي|720p|1080p|2160p|h\.264|h\.265)\b/gi,
            ''
        );
        editedTitle = editedTitle.replace(/\s+End\b/gi, '');

        // 7. Normalize multiple spaces to a single space.
        editedTitle = editedTitle.replace(/\s+/g, ' ');

        // 8. Append the extracted year back.
        if (extractedYear) {
            editedTitle += ` (${extractedYear})`;
        }

        // 9. Final trim.
        return editedTitle.trim();
    }

    async _processListingItems(doc) {
        const list = [];
        const items = doc.select("div.Block--Item, div.Small--Box");
        const imageAttr = "data-src"; 

        for (const item of items) { 
            const linkElement = item.selectFirst("a");
            if (!linkElement) continue;

            const link = linkElement.getHref;
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

                            const seasonRawTitle = seasonLinkElement.attr("title") || seasonItem.selectFirst("h3.title")?.text;
                            const seasonName = this._titleEdit(seasonRawTitle);
                            const seasonImageUrl = seasonItem.selectFirst("img")?.attr(imageAttr); 
                            const seasonLink = seasonLinkElement.getHref;

                            list.push({ name: seasonName, imageUrl: seasonImageUrl, link: seasonLink });
                        }
                    } else {
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
                const epUrl = ep.getHref; 
                const epTitleAttribute = ep.attr("title"); 

                if (epTitleAttribute) {
                    const cleanEpName = this._titleEdit(epTitleAttribute);
                    chapters.push({ name: cleanEpName, url: epUrl }); 
                }
            });
        }
        else { 
            chapters.push({ name: this._titleEdit("مشاهدة"), url: url }); 
        }

        return { name, imageUrl, description, genre, status, chapters, link: url };
    }

    async getVideoList(url) {
        const videos = [];
        const defaultHeaders = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.75 Safari/537.36",
        };

        const downloadPageUrl = url.endsWith('/') ? url + 'download/' : url + '/download/';

        if (downloadPageUrl) {
            try {
                const preferredDownloadServers = this.getPreference("preferred_download_servers") || [];
                const downloadDoc = await this.requestDoc(downloadPageUrl.replace(this.source.baseUrl, ''), { "Referer": url });
                
                const proServerLinks = downloadDoc.select("div.proServer a.downloadsLink.proServer");
                
                if (preferredDownloadServers.includes("vidtube")) {
                    for (const proLink of proServerLinks) {
                        const proServerUrl = proLink.getHref;
                        if (proServerUrl.includes("vidtube.pro")) {
                            console.log(`Debug: Found VidTube proServer link: ${proServerUrl}`);
                            const vidtubeVideos = await this._resolveVidTubeEntryPage(proServerUrl, { "Referer": downloadPageUrl });
                            if (vidtubeVideos && vidtubeVideos.length > 0) {
                                videos.push(...vidtubeVideos);
                            }
                        }
                    }
                }
            } catch (error) {
                console.warn(`Error processing download page ${downloadPageUrl}:`, error);
            }
        }

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
                const videoUrl = new URL(lines[i + 1], baseUrl).href; // Use URL constructor here, as it's a sub-request after initial setup
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

    async _resolveVidTubeEntryPage(vidtubeEntryUrl, headers = {}) {
        console.log(`Debug: _resolveVidTubeEntryPage START for ${vidtubeEntryUrl}`);
        const videos = [];
        try {
            // Replaced new URL(vidtubeEntryUrl) to avoid 'URL is not defined' error
            const originMatch = vidtubeEntryUrl.match(/^(https?:\/\/[^/]+)/);
            if (!originMatch) {
                console.warn(`VidTube: Could not extract origin from VidTube entry URL: ${vidtubeEntryUrl}`);
                throw new Error("Could not extract origin from VidTube entry URL.");
            }
            const origin = originMatch[1]; // e.g., "https://vidtube.pro"

            const pathnameMatch = vidtubeEntryUrl.match(/\/d\/([a-zA-Z0-9]+)\.html/);
            if (!pathnameMatch || !pathnameMatch[1]) {
                console.warn(`VidTube: Could not extract FILE_ID from ${vidtubeEntryUrl}. Pathname: ${vidtubeEntryUrl.split('/').pop()}`);
                videos.push({
                    url: vidtubeEntryUrl,
                    originalUrl: vidtubeEntryUrl,
                    quality: `VidTube (FILE_ID Not Found - ${vidtubeEntryUrl})`
                });
                return videos; 
            }
            const fileId = pathnameMatch[1];
            console.log(`Debug: Extracted FILE_ID: ${fileId}`);

            // Construct the embed URL as requested: https://vidtube.pro/embed-FILE_ID.html
            const embedUrl = `${origin}/embed-${fileId}.html`;
            console.log(`Debug: Constructed embed URL: ${embedUrl}`);

            // Now, extract video(s) from the constructed embed page
            const embedHeaders = { ...headers, "Referer": `${origin}/` }; // Use extracted origin for Referer
            console.log(`Debug: Calling _extractVideoFromVidTubeEmbed for ${embedUrl}`);
            const extractedVideos = await this._extractVideoFromVidTubeEmbed(embedUrl, embedHeaders);
            videos.push(...extractedVideos);
            console.log(`Debug: _resolveVidTubeEntryPage END successfully for ${vidtubeEntryUrl}`);

        } catch (error) {
            console.error(`Error in _resolveVidTubeEntryPage for ${vidtubeEntryUrl}:`, error);
            videos.push({
                url: vidtubeEntryUrl,
                originalUrl: vidtubeEntryUrl,
                quality: `VidTube (Entry Error: ${error.message || 'Unknown'}) - ${vidtubeEntryUrl}`
            });
        }
        return videos;
    }

    async _extractVideoFromVidTubeEmbed(embedUrl, headers = {}) {
        console.log(`Debug: _extractVideoFromVidTubeEmbed START for ${embedUrl}`);
        const videos = [];
        let html = ""; 

        try {
            const res = await this.client.get(embedUrl, { headers });
            
            if (!res.ok) {
                console.warn(`Debug: Failed to fetch VidTube embed page ${embedUrl}. Status: ${res.status} - ${res.statusText}`);
                videos.push({
                    url: embedUrl,
                    originalUrl: embedUrl,
                    quality: `VidTube (Embed HTTP Error: ${res.status}) - ${embedUrl}`
                });
                return videos;
            }

            html = res.body; 
            console.log(`Debug: Fetched embed page HTML for ${embedUrl}. Length: ${html.length}`);

            // 1. Check for packed JS and unpack it
            if (html.includes('(p,a,c,k,e,d)')) {
                const scriptData = html.match(/eval\(function\(p,a,c,k,e,d\).*\)/s)?.[0];
                if (scriptData) {
                    const unpacked = await this._jsUnpack(scriptData);
                    if (unpacked) {
                        html = unpacked; 
                        console.log("Debug: VidTube embed page unpacked successfully.");
                    } else {
                        console.warn("Debug: VidTube embed page unpacking failed, proceeding with original HTML.");
                    }
                }
            }

            // 2. Attempt to find JWPlayer configuration
            let jwplayerFileMatch = html.match(/(?:jwplayer\(.+?\)|playerInstance)\.setup\s*\(\s*{[^}]*?"file"\s*:\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/s);
            if (jwplayerFileMatch) {
                let videoSource = jwplayerFileMatch[1];
                videoSource = videoSource.replace(/\\(.)/g, '$1'); 

                // Replaced new URL(videoSource, embedUrl).href to avoid 'URL is not defined' error if videoSource is relative
                if (videoSource.startsWith('//')) {
                    videoSource = `https:${videoSource}`;
                } else if (videoSource.startsWith('/')) {
                    const embedOriginMatch = embedUrl.match(/^(https?:\/\/[^/]+)/);
                    if (embedOriginMatch) {
                        videoSource = `${embedOriginMatch[1]}${videoSource}`;
                    } else {
                        console.warn(`VidTube: Could not determine origin for relative videoSource: ${videoSource} from ${embedUrl}. Hardcoding VidTube origin.`);
                        videoSource = `https://vidtube.pro${videoSource}`; // Fallback for VidTube's known origin
                    }
                }

                console.log(`Debug: Found JWPlayer video source: ${videoSource}`);

                if (videoSource.includes('.m3u8')) {
                    console.log(`Debug: Fetching M3U8 for ${videoSource}`);
                    // Use URL constructor here as this is a separate fetch for an M3U8 manifest,
                    // and baseUrl is needed. If URL is still undefined here, this will fail.
                    // Assuming URL is defined for nested uses.
                    const m3u8Res = await this.request(videoSource, { "Referer": embedUrl }); 
                    const parsedM3U8Videos = await this._parseM3U8(m3u8Res.body, videoSource, "VidTube");
                    if (parsedM3U8Videos.length > 0) {
                        parsedM3U8Videos.forEach(v => {
                            v.quality = `VidTube - ${v.quality} (${videoSource.substring(0, 50)}...)`; // Shorten URL for display
                        });
                        videos.push(...parsedM3U8Videos);
                    } else {
                         videos.push({
                            url: videoSource,
                            originalUrl: embedUrl,
                            quality: `VidTube - Auto M3U8 (No Qualities Found - ${videoSource.substring(0, 50)}...)`
                        });
                    }
                    console.log(`Debug: _extractVideoFromVidTubeEmbed END for ${embedUrl} (JWPlayer M3U8)`);
                    return videos;
                } else {
                    videos.push({
                        url: videoSource,
                        originalUrl: embedUrl,
                        quality: `VidTube - MP4 (${videoSource.substring(0, 50)}...)` 
                    });
                    console.log(`Debug: _extractVideoFromVidTubeEmbed END for ${embedUrl} (JWPlayer MP4)`);
                    return videos;
                }
            }

            // 3. Fallback: Look for a direct <video> tag
            const doc = new Document(html); 
            const videoElement = doc.selectFirst('video');
            if (videoElement) {
                let videoSource = videoElement.getSrc || videoElement.attr('src'); 
                 if (videoSource) {
                    // Replaced new URL(videoSource, embedUrl).href to avoid 'URL is not defined' error if videoSource is relative
                    if (videoSource.startsWith('//')) {
                        videoSource = `https:${videoSource}`;
                    } else if (videoSource.startsWith('/')) {
                        const embedOriginMatch = embedUrl.match(/^(https?:\/\/[^/]+)/);
                        if (embedOriginMatch) {
                            videoSource = `${embedOriginMatch[1]}${videoSource}`;
                        } else {
                            console.warn(`VidTube: Could not determine origin for relative videoSource: ${videoSource} from ${embedUrl}. Hardcoding VidTube origin.`);
                            videoSource = `https://vidtube.pro${videoSource}`; // Fallback for VidTube's known origin
                        }
                    }
                    console.log(`Debug: Found <video> tag source: ${videoSource}`);

                     if (videoSource.includes('.m3u8')) {
                        console.log(`Debug: Fetching M3U8 for ${videoSource} from <video> tag`);
                        const m3u8Res = await this.request(videoSource, { "Referer": embedUrl });
                        const parsedM3U8Videos = await this._parseM3U8(m3u8Res.body, videoSource, "VidTube");
                         parsedM3U8Videos.forEach(v => {
                            v.quality = `VidTube - ${v.quality} (${videoSource.substring(0, 50)}...)`;
                        });
                        videos.push(...parsedM3U8Videos);
                        console.log(`Debug: _extractVideoFromVidTubeEmbed END for ${embedUrl} (<video> M3U8)`);
                        return videos;
                    } else {
                        videos.push({
                            url: videoSource,
                            originalUrl: embedUrl,
                            quality: `VidTube - MP4 (${videoSource.substring(0, 50)}...)`
                        });
                        console.log(`Debug: _extractVideoFromVidTubeEmbed END for ${embedUrl} (<video> MP4)`);
                        return videos;
                    }
                 }
            }

            // Fallback if no video source is found through any method
            console.warn(`Debug: No video source found on VidTube embed page: ${embedUrl}. Returning fallback.`);
            videos.push({
                url: embedUrl, 
                originalUrl: embedUrl,
                quality: `VidTube (No Stream Found - ${embedUrl})`
            });
            console.log(`Debug: _extractVideoFromVidTubeEmbed END with fallback for ${embedUrl}`);
            return videos;

        } catch (error) {
            console.error(`Error in _extractVideoFromVidTubeEmbed for ${embedUrl}:`, error);
            videos.push({
                url: embedUrl,
                originalUrl: embedUrl,
                quality: `VidTube (Embed Processing Error: ${error.message || 'Unknown'}) - ${embedUrl}` 
            });
            console.log(`Debug: _extractVideoFromVidTubeEmbed END with error for ${embedUrl}`);
            return videos;
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
            "query": "/category/afm-agnby-3/" 
        }, {
            "name": "افلام انمى",
            "query": "/category/afm-anme-1/"
        }, {
            "name": "افلام اسيويه",
            "query": "/category/afm-aswy/"
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
            "query": "/category/mslslt-agnby/"
        }, {
            "name": "مسلسلات اجنبى نتفليكس",
            "query": "/netflix-series/?cat=7" 
        }, {
            "name": "مسلسلات اسيوية",
            "query": "/category/mslslt-aswy-7/"
        }, {
            "name": "مسلسلات اسيوية نتفليكس",
            "query": "/netflix-series/?cat=9" 
        }, {
            "name": "مسلسلات انمي",
            "query": "/category/mslslt-anme-1/" 
        }, {
            "name": "مسلسلات انمي نتفلكس",
            "query": "/netflix-series/?cat=8" 
        },
        {
            "name": "احدث حلقات الانمي",
            "query": "/category/mslslt-anme-1/?key=episodes" 
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
                value: "720", 
                entries: ["720p", "480p", "360p", "Auto"], 
                entryValues: ["720", "480", "360", "Auto"], 
            }
        }, {
            key: "preferred_download_servers",
            multiSelectListPreference: {
                title: "سيرفرات التحميل المفضلة",
                summary: "اختر سيرفرات التحميل التي تفضل ظهورها. (تنطبق فقط على روابط التحميل المباشر).",
                values: ["vidtube"], 
                entries: ["VidTube (متعدد الجودات)"], 
                entryValues: ["vidtube"], 
            }
        }];
    }
}

new DefaultExtension();
