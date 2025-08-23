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
        // Define a consistent User-Agent for all external requests
        this._defaultHeaders = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.75 Safari/537.36",
        };
    }

    getPreference(key) {
        return new SharedPreferences().get(key);
    }

    // Centralized request method for fetching a Document (HTML parsing)
    async requestDoc(path, headers = {}) {
        const url = this.source.baseUrl + path;
        // The `request` method below handles merging `_defaultHeaders`
        const res = await this.request(url, headers);
        return new Document(res.body);
    }

    // Centralized request method for raw HTTP response
    async request(url, headers = {}) {
        // Merge custom headers with default headers, prioritizing custom ones
        const requestHeaders = { ...this._defaultHeaders, ...headers };
        const res = await this.client.get(url, { headers: requestHeaders });
        return res;
    }

    /**
     * Helper function to resolve relative URLs when `new URL()` is not available.
     * This is needed because VidTube's quality links are relative paths.
     * @param {string} path The potentially relative URL path.
     * @param {string} baseUrl The base URL to resolve against.
     * @returns {string} The resolved absolute URL.
     */
    resolveRelativeUrl(path, baseUrl) {
        if (!path) return baseUrl;

        // Already absolute
        if (path.startsWith('http://') || path.startsWith('https://')) {
            return path;
        }
        // Protocol-relative (e.g., //example.com/path)
        if (path.startsWith('//')) {
            const baseProtocolMatch = baseUrl.match(/^(https?):/);
            return `${baseProtocolMatch ? baseProtocolMatch[1] : 'https'}:${path}`; // Use base protocol or default to https
        }

        const baseOriginMatch = baseUrl.match(/^(https?:\/\/[^/]+)/);
        const baseOrigin = baseOriginMatch ? baseOriginMatch[1] : '';

        // Absolute path from the base URL's origin (e.g., /some/path relative to https://example.com/dir/file)
        if (path.startsWith('/')) {
            return `${baseOrigin}${path}`;
        }
        
        // Truly relative path (e.g., "file.html" relative to "base/dir/")
        // Find the last slash in the base URL to determine the current directory
        const lastSlashIndex = baseUrl.lastIndexOf('/');
        const basePath = (lastSlashIndex > (baseOrigin.length + 2)) ? baseUrl.substring(0, lastSlashIndex + 1) : `${baseOrigin}/`; // Ensure it ends with a slash if it's a directory

        return `${basePath}${path}`;
    }

    /**
     * Helper function to extract the origin from a URL string without using the URL object.
     * @param {string} url The full URL string.
     * @returns {string} The origin (e.g., "https://example.com").
     */
    _getOrigin(url) {
        const match = url.match(/^(https?:\/\/[^/]+)/);
        return match ? match[1] : '';
    }

    /**
     * Helper to get numeric resolution from quality string (e.g., "1080p FHD" -> 1080, "Original" -> 9999)
     * Assigns a high value to "Original" to prioritize it in sorting if no explicit resolution.
     * @param {string} qualityLabel The simplified quality label (e.g., "Original", "1080p FHD")
     * @returns {number} The numeric resolution (e.g., 1080) or a high value for "Original", or 0 for unknown.
     */
    _getResolution(qualityLabel) {
        const match = qualityLabel.match(/(\d{3,4})p/i); // Matches "1080p", "720p", "480p"
        if (match) {
            return parseInt(match[1], 10);
        }
        if (qualityLabel.toLowerCase().includes("original")) {
            return 9999; // Assume original is highest quality for sorting
        }
        return 0; // Default for unknown/unparsed resolutions
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
                // WARNING: This nested request for each series item can be a performance bottleneck.
                // Consider if fetching all seasons on the main listing page is strictly necessary.
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
                        list.push({ name, imageUrl, link }); // Fallback if no seasons found on series page
                    }
                } catch (error) {
                    console.error(`Error processing series ${name} (${link}):`, error, error.stack);
                    list.push({ name, imageUrl, link }); // Add original series if season parsing fails
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
        const streams = [];

        // 1. Construct the download page URL from the original episode URL
        const downloadPagePath = url.replace(this.source.baseUrl, '') + (url.endsWith('/') ? 'download/' : '/download/');
        
        // Fetch the Topcinema download page
        const downloadPageDoc = await this.requestDoc(downloadPagePath, {
            "Referer": url // Referer from episode page to download page
        });

        // 2. Find the VidTube download link on the Topcinema download page
        const vidtubeLinkElement = downloadPageDoc.selectFirst("div.proServer a.downloadsLink.proServer.green");
        
        if (!vidtubeLinkElement) {
            console.warn("No VidTube download link found on: " + downloadPagePath);
            return streams; // No VidTube link, return empty
        }

        const vidtubeQualityPageUrl = vidtubeLinkElement.getHref; // e.g., https://vidtube.pro/d/bprhyyg93roo.html
        const vidtubeOrigin = this._getOrigin(vidtubeQualityPageUrl); // e.g., https://vidtube.pro

        if (!vidtubeOrigin) {
            console.error("Could not extract VidTube origin from URL: " + vidtubeQualityPageUrl);
            return streams;
        }

        // 3. Fetch the VidTube quality selection page
        const vidtubeQualityPageDoc = await this.request(vidtubeQualityPageUrl, {
            "Referer": url // Referer from Topcinema episode page to VidTube
        }).then(res => new Document(res.body));

        // 4. Extract all available quality download links from VidTube
        const qualityLinkElements = vidtubeQualityPageDoc.select("div.row.mb-3.justify-content-center .col-lg-6 a.btn.btn-light");

        const qualities = [];
        for (const linkElement of qualityLinkElements) {
            const relativeQualityPath = linkElement.getHref; // e.g., /d/bprhyyg93roo_x
            const absoluteQualityUrl = this.resolveRelativeUrl(relativeQualityPath, vidtubeOrigin); // Resolve relative path against VidTube origin
            
            const qualityTextElement = linkElement.selectFirst("b.text-primary.flex-grow-1.text-start.large");
            const sizeTextElement = linkElement.selectFirst("span.small.text-muted");
            
            let qualityLabel = qualityTextElement?.text.trim() || "Unknown Quality"; // e.g., "Original", "1080p FHD"
            let sizeInfo = sizeTextElement?.text.trim() || ""; // e.g., "1920x800, 619.8 MB"

            let fullQualityString = qualityLabel;
            if (sizeInfo) {
                fullQualityString += ` (${sizeInfo})`;
            }
            
            if (absoluteQualityUrl) {
                qualities.push({ url: absoluteQualityUrl, quality: fullQualityString, label: qualityLabel });
            }
        }
        
        // 5. Apply preferred quality filter and sorting
        const preferredQualitySetting = this.getPreference("preferred_quality"); // e.g., "Auto", "original", "1080p"
        let relevantQualities = [...qualities]; // Start with all qualities

        if (preferredQualitySetting && preferredQualitySetting !== "Auto") {
            const normalizedPreferred = preferredQualitySetting.toLowerCase();

            const matchingQualities = qualities.filter(q => {
                // Match against the simplified label for preference
                const qLabelLower = q.label.toLowerCase(); 
                // Checks if the quality label includes the preferred setting (e.g., "1080p FHD" includes "1080p")
                return qLabelLower.includes(normalizedPreferred);
            });
            
            if (matchingQualities.length > 0) {
                relevantQualities = matchingQualities;
            } else {
                console.warn(`Preferred quality "${preferredQualitySetting}" not found among available streams, falling back to all available qualities.`);
                // If no specific match, relevantQualities remains the full list due to initial assignment
            }
        }
        
        // Sort qualities (highest resolution first, "Original" if prioritized)
        relevantQualities.sort((a, b) => {
            const resA = this._getResolution(a.label); // Use label for resolution parsing
            const resB = this._getResolution(b.label);
            
            // Primary sort by resolution (descending)
            if (resA !== resB) {
                return resB - resA;
            }
            // Secondary sort for stable order if resolutions are the same.
            return 0; 
        });

        // 6. Fetch the final direct video URL for each selected quality
        for (const qualityEntry of relevantQualities) {
            try {
                // Fetch the VidTube final download link page
                const finalDownloadPageDoc = await this.request(qualityEntry.url, {
                    "Referer": vidtubeOrigin // Referer from VidTube quality page to VidTube final download page
                }).then(res => new Document(res.body));

                const directDownloadLinkElement = finalDownloadPageDoc.selectFirst("a.btn.btn-gradient.submit-btn");
                const finalVideoUrl = directDownloadLinkElement?.getHref;

                if (finalVideoUrl) {
                    streams.push({
                        url: finalVideoUrl,
                        originalUrl: finalVideoUrl,
                        quality: qualityEntry.quality, // Use the full string including size
                        headers: {
                            "Referer": vidtubeOrigin, // Crucial for playing the video stream
                            ...this._defaultHeaders // Merge other default headers like User-Agent
                        }
                    });
                } else {
                    console.warn(`No direct download link found on ${qualityEntry.url} for quality: ${qualityEntry.quality}`);
                }
            } catch (error) {
                console.error(`Error fetching final video for quality ${qualityEntry.quality} from ${qualityEntry.url}:`, error, error.stack);
            }
        }
        
        return streams;
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
                value: "Auto", // Default to Auto for better user experience
                entries: ["Auto", "Original", "1080p FHD", "720p HD", "480p SD"], 
                entryValues: ["Auto", "original", "1080p", "720", "480"], // Use simplified entry values for matching
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
