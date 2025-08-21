--- START OF FILE movizland.js ---

const mangayomiSources = [{
    "name": "Movizland",
    "id": 9934567890, 
    "lang": "ar",
    "baseUrl": "https://movizland.lol",
    "iconUrl": "https://i.ibb.co/ZS8tq3z/movizl.png",
    "typeSource": "multi", 
    "itemType": 1,
    "version": "1.0.0", 
    "pkgPath": "anime/src/ar/movizland.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    getPreference(key) {
        return new SharedPreferences().get(key);
    }

    getBaseUrl() {
        return this.getPreference("movizland_base_url") || this.source.baseUrl;
    }

    getHeaders(refererUrl = this.getBaseUrl()) {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36",
            "Referer": refererUrl,
            "Origin": this.getBaseUrl(),
            "Accept-Encoding": "gzip",
            "Content-Type": "application/x-www-form-urlencoded"
        };
    }

    // Helper to request and parse HTML
    async requestDoc(url, postData = null) {
        const headers = this.getHeaders(url);
        let res;
        if (postData) {
            res = await this.client.post(url, headers, postData);
        } else {
            res = await this.client.get(url, headers);
        }
        if (res.statusCode !== 200) {
            throw new Error(`Request failed with status: ${res.statusCode} for URL: ${url}`);
        }
        return new Document(res.body);
    }

    // Helper for common item parsing
    parseItems(doc) {
        const list = [];
        const items = doc.select(".BlockItem"); // Main item container

        items.forEach(item => {
            const linkElement = item.selectFirst("a");
            const imageElement = item.selectFirst("img");
            const titleElement = item.selectFirst(".Title"); 

            if (linkElement && imageElement && titleElement) {
                const url = linkElement.getHref;
                let imageUrl = imageElement.getSrc;
                if (!imageUrl.startsWith("http")) {
                    imageUrl = this.getBaseUrl() + imageUrl;
                }

                const name_eng = titleElement.text.trim(); 

                // Extracting parts for description
                const imdbElement = item.selectFirst(".StarsIMDB");
                const genreLinkElement = item.selectFirst(".RestInformation .fa-film")?.parent; // Get parent 'a' or 'li' for text
                const qualityElement = item.selectFirst(".RestInformation .desktop");
                
                const infoEndBlockElements = item.select(".InfoEndBlock li");

                const descriptionText = this.buildDescription(
                    imdbElement?.text,
                    genreLinkElement?.text, // Pass the text content of the parent.
                    qualityElement?.text,
                    infoEndBlockElements
                );

                const { title: cleanedTitle, desc: titleDescPart } = this.uniform_titre(name_eng);

                list.push({
                    name: cleanedTitle,
                    link: url,
                    imageUrl: imageUrl,
                    description: titleDescPart + descriptionText,
                });
            }
        });
        return list;
    }

    // Helper for description extraction (porting get_desc from Python)
    buildDescription(imdbText, genreText, qualityText, infoEndBlockElements) {
        let desc = '';

        if (imdbText && imdbText.trim() !== 'n/A') {
            desc += `IMDB: ${imdbText.trim()}\n`;
        }

        if (genreText && genreText.trim() !== 'n/A') {
            // Python's regex was a bit specific, simplifying to extract only the genre name
            const genreMatch = genreText.match(/fa-film">(.*?)<\//s);
            if (genreMatch && genreMatch[1]) {
                desc += `Genre: ${genreMatch[1].trim().replace(/<\/?span>/g, '').replace(/<i[^>]*?><\/i>/g, '')}\n`;
            } else {
                // Fallback for cases where direct match isn't perfect
                desc += `Genre: ${genreText.replace(/<\/?span>/g, '').replace(/\s*Genre:\s*/, '').trim()}\n`;
            }
        }

        if (qualityText) {
            desc += `Quality: ${qualityText.trim()}\n`;
        }

        infoEndBlockElements.forEach(li => {
            const span = li.selectFirst('span');
            const textContent = li.text.trim(); // Get full text of li
            if (span) {
                const label = span.text.trim(); // Text inside span (e.g., "سنة الإنتاج :")
                const value = textContent.replace(label, '').trim(); // Text content excluding the span
                if (label.includes('سنة')) { // Year
                    desc += `Year: ${value}\n`;
                } else if (label.includes('الإشراف')) { // Type (Family Supervision)
                    desc += `Type: ${value}\n`;
                } else if (label.includes('دولة')) { // Country
                    desc += `Country: ${value}\n`;
                }
            }
        });
        return desc;
    }

    // Helper for title sanitization (porting uniform_titre from Python)
    uniform_titre(name_eng) {
        let title_display = name_eng.replace(/&#038;/g, '&').replace(/&#8217;/g, "'").trim();
        let desc_part = ''; 
        return { title: title_display, desc: desc_part };
    }

    // Helper for pagination check
    hasNextPage(doc) {
        // Look for next page link or pagination indicating more pages
        const paginationNext = doc.selectFirst('a.next.page-numbers');
        const paginationRelNext = doc.selectFirst('a[rel="next"]');
        
        // If there's a "next" link, or if the page doesn't explicitly state no next page (e.g. current page is not last)
        // This can be tricky, the Python script uses `re.findall('(<a class="next|>الصفحة التالية &laquo;</a>)', data, re.S)`
        // and checks if `films_list` is not empty.
        // For now, let's rely on the existence of a 'next' button.
        return paginationNext !== null || paginationRelNext !== null;
    }

    // Main catalogue methods
    async getPopular(page) {
        // Based on Python's showmenu1 and showitms, using default popular filter link
        const url = `${this.getBaseUrl()}/filter/tax-movies/most-watched/page/${page}/`;
        const doc = await this.requestDoc(url);
        const list = this.parseItems(doc);
        const hasNext = this.hasNextPage(doc);
        return { list, hasNextPage: hasNext };
    }

    async getLatestUpdates(page) {
        // Based on Python's showmenu1 and showitms, using default recently-added filter link
        const url = `${this.getBaseUrl()}/filter/tax-movies/recently-added/page/${page}/`;
        const doc = await this.requestDoc(url);
        const list = this.parseItems(doc);
        const hasNext = this.hasNextPage(doc);
        return { list, hasNextPage: hasNext };
    }

    async search(query, page, filters) {
        let url;
        
        // Get "Search Section" filter value
        const searchSectionFilter = filters.find(f => f.name === "Search Section");
        let section = "";
        if (searchSectionFilter && searchSectionFilter.state > 0) {
            section = searchSectionFilter.values[searchSectionFilter.state].value;
        }

        if (section === "movie") {
            url = `${this.getBaseUrl()}/search/${encodeURIComponent(query)}+فيلم/page/${page}/`;
        } else if (section === "series") {
            url = `${this.getBaseUrl()}/search/${encodeURIComponent(query)}+مسلسل/page/${page}/`;
        } else { // all
            url = `${this.getBaseUrl()}/search/${encodeURIComponent(query)}/page/${page}/`;
        }

        const doc = await this.requestDoc(url);
        const list = this.parseItems(doc);
        const hasNext = this.hasNextPage(doc);
        return { list, hasNextPage: hasNext };
    }

    async getDetail(url) {
        const doc = await this.requestDoc(url);

        const nameElement = doc.selectFirst('h1.Single-Title, h1.Title');
        const name = nameElement ? nameElement.text.trim() : '';

        const imageElement = doc.selectFirst('.SingleDetails img, .Poster img');
        let imageUrl = imageElement ? imageElement.getSrc : '';
        if (imageUrl && !imageUrl.startsWith("http")) {
            imageUrl = this.getBaseUrl() + imageUrl;
        }

        let description = '';
        const storyElement = doc.selectFirst('.StoryContent, .story');
        if (storyElement) {
            description = storyElement.text.trim();
        }

        const genre = [];
        // Selectors from different templates of Movizland
        const genreElements = doc.select('.meta .category a, .tax-links a[href*="/genre/"]');
        genreElements.forEach(el => genre.push(el.text.trim()));

        let status = 5; // Unknown by default
        const statusElement = doc.selectFirst('.SingleDetails .Status, .BlockDetails span:contains(الحالة) + a');
        if (statusElement) {
            const statusText = statusElement.text.trim();
            if (statusText.includes('مكتمل') || statusText.includes('Completed')) {
                status = 1; // Completed
            } else if (statusText.includes('يعرض') || statusText.includes('Ongoing')) {
                status = 0; // Ongoing
            }
        }
        
        const chapters = [];
        // Combined selectors for episode links
        const episodeElements = doc.select('ul.list-episode-item-2.all-episode li a, .EpisodeItem'); 
        if (episodeElements.length > 0) {
            episodeElements.forEach(ep => {
                const epLink = ep.getHref;
                // Python's `<em>` tag is for episode number/title inside the link
                const epNameMatch = ep.outerHtml.match(/<em>(.*?)<\/em>/);
                const epName = epNameMatch ? epNameMatch[1].trim() : ep.text.trim();

                if (epName) {
                    chapters.push({ name: epName, url: epLink });
                }
            });
        } else {
            // If no episode list, it's likely a movie
            chapters.push({ name: 'Movie', url: url });
        }
        chapters.reverse(); // Often episodes are listed newest first, reverse to old-to-new

        return { name, imageUrl, description, genre, status, chapters, link: url };
    }

    async getVideoList(url) {
        const videos = [];
        const headers = this.getHeaders(url);
        const res = await this.client.get(url, headers);
        const doc = new Document(res.body);

        // --- Local server (Moshahda) / Main iframe extraction ---
        const mainIframe = doc.selectFirst('#EmbedScmain iframe');
        if (mainIframe) {
            const iframeSrc = mainIframe.getSrc;
            if (iframeSrc) {
                try {
                    const embedRes = await this.client.get(iframeSrc, { Referer: url });
                    const embedBody = embedRes.body;

                    // Check for packed JS and unpack it
                    const packedJsMatch = embedBody.match(/(eval\(function\(p,a,c,k,e,d\).+?)(?:<\/script>|eval\s*\()/s); // Looser match for end
                    let unpackedContent = embedBody;
                    if (packedJsMatch && packedJsMatch[1]) {
                        const packedJs = packedJsMatch[1];
                        try {
                            unpackedContent = unpackJs(packedJs); 
                        } catch (e) {
                            console.error("Error unpacking JS for main iframe:", e);
                            unpackedContent = embedBody; // Fallback to original body if unpack fails
                        }
                    }

                    // Look for HLS streams in the unpacked content or original body
                    const hlsMatch = unpackedContent.match(/file:"(.*?\.m3u8)"/);
                    if (hlsMatch && hlsMatch[1]) {
                        const streamUrl = hlsMatch[1];
                        videos.push({
                            url: streamUrl,
                            originalUrl: streamUrl,
                            quality: 'Moshahda - Auto',
                            headers: { Referer: iframeSrc }
                        });
                    }
                } catch (e) {
                    console.error("Error extracting from main iframe:", e);
                }
            }
        }

        // --- Other servers (data-srcout attribute) ---
        const otherServers = doc.select('li[data-server-id][srcout]');
        for (const serverEl of otherServers) {
            const serverName = serverEl.text.trim();
            const srcOutUrl = serverEl.attr('srcout');
            if (srcOutUrl) {
                videos.push({
                    url: srcOutUrl,
                    originalUrl: srcOutUrl,
                    quality: `${serverName} - Auto`,
                    headers: { Referer: url }
                });
            }
        }

        // --- Mobile version links (HLS/Download) ---
        const mobileLinksMatch = doc.outerHtml.matchAll(/rgba\(203, 0, 44, 0\.36\).*?href="(.*?)".*?ViewMovieNow">(.*?)<\//g);
        for (const match of mobileLinksMatch) {
            const mobileUrl = match[1];
            const qualityLabelRaw = match[2];

            if (mobileUrl) {
                // If it's an HLS link, fetch that page and unpack
                if (qualityLabelRaw.includes('HLS')) {
                    try {
                        const hlsPageRes = await this.client.get(mobileUrl, { Referer: url });
                        const hlsPageDoc = new Document(hlsPageRes.body);
                        const hlsIframe = hlsPageDoc.selectFirst('iframe');
                        if (hlsIframe) {
                            const hlsIframeSrc = hlsIframe.getSrc;
                            const hlsEmbedRes = await this.client.get(hlsIframeSrc, { Referer: mobileUrl });
                            const hlsEmbedBody = hlsEmbedRes.body;
                            
                            const packedJsMatch = hlsEmbedBody.match(/(eval\(function\(p,a,c,k,e,d\).+?)(?:<\/script>|eval\s*\()/s);
                            let unpackedContent = hlsEmbedBody;
                            if (packedJsMatch && packedJsMatch[1]) {
                                try {
                                    unpackedContent = unpackJs(packedJsMatch[1]);
                                } catch (e) {
                                    console.error("Error unpacking JS for mobile HLS iframe:", e);
                                    unpackedContent = hlsEmbedBody;
                                }
                            }
                            const hlsMatch = unpackedContent.match(/file:"(.*?\.m3u8)"/);
                            if (hlsMatch && hlsMatch[1]) {
                                videos.push({
                                    url: hlsMatch[1],
                                    originalUrl: hlsMatch[1],
                                    quality: 'HLS - Movizland',
                                    headers: { Referer: hlsIframeSrc }
                                });
                            }
                        }
                    } catch (e) {
                        console.error("Error extracting from mobile HLS link:", e);
                    }
                } else {
                    // Handle non-HLS mobile links as direct links
                    let qualityLabel = 'Movizland';
                    if (qualityLabelRaw.includes('منخفضة')) qualityLabel = 'Low - Movizland';
                    else if (qualityLabelRaw.toLowerCase().includes('sd')) qualityLabel = 'SD - Movizland';
                    else if (qualityLabelRaw.toLowerCase().includes('hd')) qualityLabel = 'HD - Movizland';
                    else if (qualityLabelRaw.includes('تحميل')) qualityLabel = 'Download - Movizland';
                    
                    videos.push({
                        url: mobileUrl,
                        originalUrl: mobileUrl,
                        quality: qualityLabel,
                        headers: { Referer: url }
                    });
                }
            }
        }


        if (videos.length === 0) {
            throw new Error("No video streams found from any enabled sources.");
        }
        return videos;
    }

    getFilterList() {
        // This is a simplified version based on Python's 'showsearch' options,
        // allowing selection for the type of content to search within.
        function f(name, value) { return { type_name: "SelectOption", name, value }; }

        return [
            { type_name: "HeaderFilter", name: "ملاحظة: الفلاتر المتقدمة غير مدعومة حاليًا. استخدم البحث عن الكلمات الرئيسية أو تصفح القوائم الشائعة/الأخيرة." },
            { type_name: "SelectFilter", name: "Search Section", state: 0, values: [
                f("الكل", ""), f("فيلم", "movie"), f("مسلسل", "series")
            ]}
        ];
    }

    getSourcePreferences() {
        return [{
            key: "movizland_base_url",
            editTextPreference: {
                title: "Override Base URL",
                summary: "Default: https://movizland.lol",
                value: "https://movizland.lol",
                dialogTitle: "Override Base URL",
                dialogMessage: "في حالة عدم عمل المصدر، حاول استخدام رابط بديل.",
            }
        }];
    }
}