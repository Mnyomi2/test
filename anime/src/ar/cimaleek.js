const mangayomiSources = [{
    "name": "سيما ليك",
    "id": 5798993892749847,
    "lang": "ar",
    "baseUrl": "https://cimalek.art",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=cimalek.art",
    "typeSource": "single",
    "itemType": 1,
    "version": "1.0.0",
    "pkgPath": "anime/src/ar/cimaleek.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    getPreference(key) {
        return new SharedPreferences().get(key);
    }

    getHeaders(referer) {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36",
            "Referer": referer || this.getBaseUrl() + "/",
        };
    }

    getBaseUrl() {
        return this.source.baseUrl;
    }

    // --- HELPER METHODS ---

    async parseCataloguePage(url) {
        const res = await this.client.get(url, this.getHeaders());
        const doc = new Document(res.body);
        const list = [];
        const items = doc.select("div.film_list-wrap div.item");

        for (const item of items) {
            const linkElement = item.selectFirst("div.film-poster a");
            const nameElement = item.selectFirst("div.data .title");
            const imageElement = item.selectFirst("div.film-poster img.film-poster-img");

            if (linkElement && nameElement && imageElement) {
                const name = nameElement.text.trim();
                const fullLink = linkElement.getHref;
                const link = fullLink.replace(/^(https?:\/\/)?[^\/]+/, '');
                const imageUrl = imageElement.attr("data-src");
                list.push({ name, imageUrl, link });
            }
        }

        const hasNextPage = doc.selectFirst("div.pagination div.pagination-num i#nextpagination") != null;
        return { list, hasNextPage };
    }

    generateRandomString(length) {
        const characters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        let result = "";
        for (let i = 0; i < length; i++) {
            const randomIndex = Math.floor(Math.random() * characters.length);
            result += characters[randomIndex];
        }
        return result;
    }

    async retry(fn, retries = 2) {
        for (let i = 0; i < retries; i++) {
            try {
                return await fn();
            } catch (e) {
                if (i === retries - 1) throw e;
                console.warn(`[Retry ${i + 1}]`, e.message);
                await new Promise(r => setTimeout(r, 1000));
            }
        }
    }

    // --- CORE METHODS ---

    async getPopular(page) {
        const url = `${this.getBaseUrl()}/trending/page/${page}/`;
        return await this.parseCataloguePage(url);
    }

    async getLatestUpdates(page) {
        const url = `${this.getBaseUrl()}/recent-89541/page/${page}/`;
        return await this.parseCataloguePage(url);
    }

    async search(query, page, filters) {
        let url;
        if (query) {
            url = `${this.getBaseUrl()}/page/${page}?s=${encodeURIComponent(query)}`;
            return await this.parseCataloguePage(url);
        }

        const sectionFilter = filters.find(f => f.name === "اقسام الموقع");
        const categoryFilter = filters.find(f => f.name === "النوع");
        const genreFilter = filters.find(f => f.name === "التصنيف");

        if (sectionFilter && sectionFilter.state !== 0) {
            const value = sectionFilter.values[sectionFilter.state].value;
            url = `${this.getBaseUrl()}/category/${value}/page/${page}/`;
        } else if (categoryFilter && categoryFilter.state !== 0) {
            const catValue = categoryFilter.values[categoryFilter.state].value;
            const genreValue = genreFilter.values[genreFilter.state].value.toLowerCase();
            url = `${this.getBaseUrl()}/genre/${genreValue}/page/${page}/?type=${catValue}`;
        } else {
            return this.getPopular(page);
        }
        
        return await this.parseCataloguePage(url);
    }

    async getDetail(url) {
        const res = await this.client.get(this.getBaseUrl() + url, this.getHeaders());
        const doc = new Document(res.body);

        const name = doc.selectFirst("h2.film-name.dynamic-name")?.text?.trim() ?? "";
        const imageUrl = doc.selectFirst("div.anisc-poster img.film-poster-img")?.attr("src") ?? "";
        const description = doc.selectFirst("div.film-description div.text")?.text?.trim() ?? "";
        const genre = doc.select("div.item-list a").map(e => e.text.trim());
        const author = doc.selectFirst("div.anisc-more-info div.item:contains(البلد) span:last-child")?.text?.trim() ?? "";
        const status = url.includes("/movies/") ? 1 : 5;

        const chapters = [];
        const isMovie = url.includes("/movies/");

        if (isMovie) {
            chapters.push({
                name: "مشاهدة",
                url: `${url}watch/`
            });
        } else {
            const seasonElements = doc.select("div.season-a ul.seas-list li.sealist a");
            for (const seasonElement of seasonElements) {
                const seasonName = seasonElement.selectFirst("span.se-a").text;
                const seasonUrl = seasonElement.getHref;
                const seasonRes = await this.client.get(seasonUrl, this.getHeaders());
                const seasonDoc = new Document(seasonRes.body);

                const episodeElements = seasonDoc.select("div.season-a ul.episodios li.episodesList a");
                for (const episodeElement of episodeElements) {
                    const episodeNum = episodeElement.selectFirst("span.serie").text.substringAfter("(").substringBefore(")");
                    const fullEpisodeUrl = episodeElement.getHref;
                    const episodePath = fullEpisodeUrl.replace(/^(https?:\/\/)?[^\/]+/, '');
                    chapters.push({
                        name: `الموسم ${seasonName} الحلقة ${episodeNum}`,
                        url: `${episodePath}watch/`
                    });
                }
            }
            chapters.reverse();
        }

        return { name, imageUrl, description, author, link: url, status, genre, chapters };
    }

    // --- VIDEO EXTRACTION ---

    async extractVideosFromUrl(url, qualityPrefix) {
        if (url.includes("mp4upload.com")) {
            return await this.mp4uploadExtractor(url, qualityPrefix);
        }
        if (url.includes("dood")) {
            return await this.doodstreamExtractor(url, qualityPrefix);
        }
        if (url.includes("voe.sx")) {
            return await this.voeExtractor(url, qualityPrefix);
        }
        if (url.includes("top15top.shop") || url.includes("megamax.click")) {
            return await this.redirectExtractor(url, qualityPrefix);
        }
        return [{ url: url, originalUrl: url, quality: `${qualityPrefix}\n${url}`, headers: this.getHeaders(url) }];
    }

    async mp4uploadExtractor(url, qualityPrefix) {
        try {
            const id = url.split('/').pop();
            const embedUrl = `https://www.mp4upload.com/embed-${id}.html`;
            const res = await this.client.get(embedUrl, this.getHeaders(embedUrl));
            const sourceMatch = res.body.match(/player\.src\({src:\s*["']([^"']+)["']/);
            if (sourceMatch && sourceMatch[1]) {
                const videoUrl = sourceMatch[1];
                return [{ url: videoUrl, originalUrl: url, quality: `${qualityPrefix} - Mp4upload\n${videoUrl}`, headers: this.getHeaders(embedUrl) }];
            }
        } catch (e) {
            console.error(`[Mp4Upload Error] ${url}`, e.message);
        }
        return [{ url: url, originalUrl: url, quality: `${qualityPrefix} - Mp4upload\n${url}`, headers: this.getHeaders(url) }];
    }

    async redirectExtractor(url, qualityPrefix) {
        try {
            let res = await this.client.get(url, this.getHeaders(this.getBaseUrl()));
            let doc = new Document(res.body);
            const form = doc.selectFirst('form[name="F1"]');
            if (form) {
                const inputs = form.select("input");
                const formData = {};
                inputs.forEach(input => {
                    formData[input.attr("name")] = input.attr("value");
                });
                await new Promise(resolve => setTimeout(resolve, 1500)); 
                res = await this.client.post(url, this.getHeaders(url), formData);
                doc = new Document(res.body);
                const finalLink = doc.selectFirst('span > a');
                if (finalLink) {
                    const videoUrl = finalLink.getHref;
                    return [{ url: videoUrl, originalUrl: url, quality: `${qualityPrefix}\n${videoUrl}`, headers: this.getHeaders(url) }];
                }
            }
        } catch(e) {
            console.error(`[RedirectExtractor Error] ${url}`, e.message);
        }
        return [{ url: url, originalUrl: url, quality: `${qualityPrefix}\n${url}`, headers: this.getHeaders(url) }];
    }

    async doodstreamExtractor(url, qualityPrefix) {
        try {
            const res = await this.client.get(url, this.getHeaders(url));
            const md5 = res.body.match(/\/pass_md5\/([^']*)'/);
            if (md5) {
                const passMd5Url = `https://dood.yt/${md5[1]}`;
                const passRes = await this.client.get(passMd5Url, this.getHeaders(url));
                const randomString = (Math.random() + 1).toString(36).substring(7);
                const token = md5[1];
                const videoUrl = `${passRes.body}${randomString}?token=${token}&expiry=${Date.now()}`;
                return [{ url: videoUrl, originalUrl: url, quality: `${qualityPrefix} - Doodstream\n${videoUrl}`, headers: this.getHeaders(url) }];
            }
        } catch (e) {
            console.error(`[Doodstream Error] ${url}`, e.message);
        }
        return [{ url: url, originalUrl: url, quality: `${qualityPrefix} - Doodstream\n${url}`, headers: this.getHeaders(url) }];
    }

    async voeExtractor(url, qualityPrefix) {
        try {
            const res = await this.client.get(url, this.getHeaders(url));
            const hlsUrlMatch = res.body.match(/'hls':\s*'([^']+)'/);
            if (hlsUrlMatch && hlsUrlMatch[1]) {
                const hlsUrl = hlsUrlMatch[1];
                return await this.extractM3U8(hlsUrl, `${qualityPrefix} - Voe`);
            }
        } catch (e) {
            console.error(`[Voe Error] ${url}`, e.message);
        }
        return [{ url: url, originalUrl: url, quality: `${qualityPrefix} - Voe\n${url}`, headers: this.getHeaders(url) }];
    }
    
    async getVideoList(url) {
        const res = await this.client.get(this.getBaseUrl() + url, this.getHeaders());
        const doc = new Document(res.body);
        let videos = [];

        // Process Streaming Servers
        const script = doc.selectFirst("script:contains(dtAjax)")?.data;
        if (script) {
            const version = script.substringAfter("ver\":\"").substringBefore("\"");
            const serverElements = doc.select("div#servers-content div.server-item div");
            for (const serverElement of serverElements) {
                const serverName = serverElement.text.trim();
                try {
                    const params = `p=${serverElement.attr("data-post")}&t=${serverElement.attr("data-type")}&n=${serverElement.attr("data-nume")}&ver=${version}&rand=${this.generateRandomString(16)}`;
                    const apiUrl = `${this.getBaseUrl()}/wp-json/lalaplayer/v2/?${params}`;
                    const frameRes = await this.client.get(apiUrl, this.getHeaders());
                    let embedUrl = JSON.parse(frameRes.body).embed_url;
                    if (embedUrl) {
                        if (embedUrl.startsWith("//")) embedUrl = "https:" + embedUrl;
                        videos.push(...(await this.extractVideosFromUrl(embedUrl, serverName)));
                    }
                } catch (e) {
                    console.error(`[Server Extraction Error] ${serverName}`, e.message);
                }
            }
        }

        // Process Download Links
        const downloadElements = doc.select("div.downlo a.ssl-item.ep-item");
        for (const element of downloadElements) {
            const downloadUrl = element.getHref;
            const qualityInfo = element.selectFirst("em")?.text ?? "Download";
            videos.push(...(await this.extractVideosFromUrl(downloadUrl, `Download ${qualityInfo}`)));
        }
        
        // Sort and Finalize
        const preferredQuality = this.getPreference("preferred_quality") || "1080";
        videos.sort((a, b) => {
            const isAPreferred = a.quality.includes(preferredQuality);
            const isBPreferred = b.quality.includes(preferredQuality);
            if (isAPreferred && !isBPreferred) return -1;
            if (!isAPreferred && isBPreferred) return 1;

            const qualityA = parseInt(a.quality.match(/(\d+)p/)?.[1] || 0);
            const qualityB = parseInt(b.quality.match(/(\d+)p/)?.[1] || 0);
            return qualityB - qualityA;
        });

        return videos;
    }

    async extractM3U8(url, serverName) {
        try {
            const res = await this.client.get(url, this.getHeaders(url));
            const masterPlaylist = res.body;
            const videoList = [];
            const baseUrlForRelativePaths = url.substring(0, url.lastIndexOf('/') + 1);
            const lines = masterPlaylist.split('\n');
            let quality = "";
            for (const line of lines) {
                if (line.includes('RESOLUTION=')) {
                    const resolution = line.match(/RESOLUTION=(\d+x\d+)/)[1];
                    quality = resolution.split('x')[1] + 'p';
                } else if (line.endsWith('.m3u8')) {
                    const videoUrl = line.startsWith('http') ? line : baseUrlForRelativePaths + line;
                    videoList.push({ url: videoUrl, originalUrl: videoUrl, quality: `${serverName}: ${quality}\n${videoUrl}`, headers: this.getHeaders(url) });
                }
            }
            if (videoList.length === 0) {
                videoList.push({ url: url, originalUrl: url, quality: `${serverName}: Auto\n${url}`, headers: this.getHeaders(url) });
            }
            return videoList;
        } catch (e) {
            console.error(`[M3U8 Error] ${url}`, e.message);
            return [{ url: url, originalUrl: url, quality: `${serverName}: Auto (HLS)\n${url}`, headers: this.getHeaders(url) }];
        }
    }

    // --- FILTERS AND PREFERENCES ---
    getFilterList() {
        return [{
            type_name: "HeaderFilter",
            name: "هذا القسم يعمل لو كان البحث فارغاً"
        }, {
            type_name: "SelectFilter",
            name: "اقسام الموقع",
            state: 0,
            values: [
                { name: "اختر", value: "none" },
                { name: "افلام اجنبي", value: "aflam-online" },
                { name: "افلام نتفليكس", value: "netflix-movies" },
                { name: "افلام هندي", value: "indian-movies" },
                { name: "افلام اسيوي", value: "asian-aflam" },
                { name: "افلام كرتون", value: "cartoon-movies" },
                { name: "افلام انمي", value: "anime-movies" },
                { name: "مسلسلات اجنبي", value: "english-series" },
                { name: "مسلسلات نتفليكس", value: "netflix-series" },
                { name: "مسلسلات اسيوي", value: "asian-series" },
                { name: "مسلسلات كرتون", value: "anime-series" },
                { name: "مسلسلات انمي", value: "netflix-anime" },
            ].map(v => ({...v, type_name: "SelectOption"}))
        }, {
            type_name: "SeparatorFilter"
        }, {
            type_name: "HeaderFilter",
            name: "الفلترة تعمل فقط لو كان قسم الموقع على 'اختر'"
        }, {
            type_name: "SelectFilter",
            name: "النوع",
            state: 0,
            values: [
                { name: "اختر", value: "none" },
                { name: "افلام", value: "movies" },
                { name: "مسلسلات", value: "series" },
            ].map(v => ({...v, type_name: "SelectOption"}))
        }, {
            type_name: "SelectFilter",
            name: "التصنيف",
            state: 0,
            values: [
                "Action", "Adventure", "Animation", "Western", "Documentary", "Fantasy", 
                "Science-fiction", "Romance", "Comedy", "Family", "Drama", "Thriller", 
                "Crime", "Horror"
            ].sort().map(g => ({ type_name: "SelectOption", name: g, value: g }))
        }];
    }
    
    getSourcePreferences() {
        return [{
            key: "preferred_quality",
            listPreference: {
                title: "الجودة المفضلة",
                summary: "اختر الجودة التي تفضلها",
                valueIndex: 0,
                entries: ["1080p", "720p", "480p", "360p", "240p"],
                entryValues: ["1080", "720", "480", "360", "240"],
            }
        }];
    }
}
