const mangayomiSources = [{
    "name": "سيما ليك",
    "id": 5798993892749847,
    "lang": "ar",
    "baseUrl": "https://m.cimaleek.to",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=m.cimaleek.to",
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

    getHeaders() {
        return {
            "Referer": this.getBaseUrl() + "/",
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
            const linkElement = item.selectFirst("a");
            const name = item.selectFirst("div.data .title").text;
            const imageUrl = item.selectFirst("img").attr("data-src");
            const link = linkElement.getHref.replace(this.getBaseUrl(), "");
            list.push({ name, imageUrl, link });
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

    // --- CORE METHODS ---

    async getPopular(page) {
        const url = `${this.getBaseUrl()}/trending/page/${page}/`;
        return await this.parseCataloguePage(url);
    }

    async getLatestUpdates(page) {
        const url = `${this.getBaseUrl()}/recent/page/${page}/`;
        return await this.parseCataloguePage(url);
    }

    async search(query, page, filters) {
        if (query) {
            const url = `${this.getBaseUrl()}/page/${page}?s=${query}`;
            return await this.parseCataloguePage(url);
        }

        const sectionFilter = filters.find(f => f.name === "اقسام الموقع");
        const categoryFilter = filters.find(f => f.name === "النوع");
        const genreFilter = filters.find(f => f.name === "التصنيف");

        let url = this.getBaseUrl();
        const params = new URLSearchParams();

        if (sectionFilter && sectionFilter.state !== 0) {
            const value = sectionFilter.values[sectionFilter.state].value;
            url += `/category/${value}/page/${page}/`;
        } else if (categoryFilter && categoryFilter.state !== 0) {
            const catValue = categoryFilter.values[categoryFilter.state].value;
            const genreValue = genreFilter.values[genreFilter.state].value.toLowerCase();
            url += `/genre/${genreValue}/page/${page}/`;
            params.set("type", catValue);
        } else {
            // Default to popular if no filters are selected
            return this.getPopular(page);
        }
        
        const finalUrl = `${url}?${params.toString()}`;
        return await this.parseCataloguePage(finalUrl);
    }

    async getDetail(url) {
        const res = await this.client.get(this.getBaseUrl() + url, this.getHeaders());
        const doc = new Document(res.body);

        const name = doc.selectFirst("div.anisc-more-info div.item:contains(الاسم) span:nth-child(3)").text;
        const imageUrl = doc.selectFirst("div.ani_detail-stage div.film-poster img").attr("src");
        const description = doc.selectFirst("div.anisc-detail div.film-description div.text").text;
        const genre = doc.select("div.anisc-detail div.item-list a").map(e => e.text);
        const status = doc.select("div.anisc-detail div.item-list").text.includes("افلام") ? 1 : 5;

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
                    const episodeUrl = episodeElement.getHref.replace(this.getBaseUrl(), "");
                    chapters.push({
                        name: `الموسم ${seasonName} الحلقة ${episodeNum}`,
                        url: `${episodeUrl}watch/`
                    });
                }
            }
            chapters.reverse();
        }

        return { name, imageUrl, description, link: url, status, genre, chapters };
    }

    async getVideoList(url) {
        const res = await this.client.get(this.getBaseUrl() + url, this.getHeaders());
        const doc = new Document(res.body);
        const videos = [];

        const script = doc.selectFirst("script:contains(dtAjax)").data;
        const version = script.substringAfter("ver\":\"").substringBefore("\"");

        const serverElements = doc.select("div#servers-content div.server-item div");
        for (const serverElement of serverElements) {
            try {
                const apiUrl = new URL(`${this.getBaseUrl()}/wp-json/lalaplayer/v2/`);
                apiUrl.searchParams.set("p", serverElement.attr("data-post"));
                apiUrl.searchParams.set("t", serverElement.attr("data-type"));
                apiUrl.searchParams.set("n", serverElement.attr("data-nume"));
                apiUrl.searchParams.set("ver", version);
                apiUrl.searchParams.set("rand", this.generateRandomString(16));
                
                const frameRes = await this.client.get(apiUrl.toString(), this.getHeaders());
                const frameData = JSON.parse(frameRes.body);
                const embedUrl = frameData.embed_url;

                if (embedUrl) {
                    const embedRes = await this.client.get(embedUrl, { "Referer": this.getBaseUrl() + "/" });
                    const embedHtml = embedRes.body;
                    const sourceMatch = embedHtml.match(/sources:\s*\[{\s*file:\s*"([^"]+)"/);
                    if (sourceMatch && sourceMatch[1]) {
                        const videoUrl = sourceMatch[1];
                        if (videoUrl.includes(".m3u8")) {
                            const qualities = await this.extractM3U8(videoUrl, serverElement.text);
                            videos.push(...qualities);
                        } else {
                            videos.push({
                                url: videoUrl,
                                originalUrl: videoUrl,
                                quality: serverElement.text,
                                headers: { "Referer": embedUrl }
                            });
                        }
                    }
                }
            } catch (e) {
                // Ignore server error
            }
        }
        
        const preferredQuality = this.getPreference("preferred_quality") || "1080";
        videos.sort((a, b) => {
            const qualityA = parseInt(a.quality.match(/(\d+)p/)?.[1] || 0);
            const qualityB = parseInt(b.quality.match(/(\d+)p/)?.[1] || 0);
            if (a.quality.includes(preferredQuality)) return -1;
            if (b.quality.includes(preferredQuality)) return 1;
            return qualityB - qualityA;
        });

        return videos;
    }

    async extractM3U8(url, serverName) {
        const res = await this.client.get(url, { "Referer": url });
        const masterPlaylist = res.body;
        const videoList = [];

        const lines = masterPlaylist.split('\n');
        let quality = "";
        for (const line of lines) {
            if (line.includes('RESOLUTION=')) {
                const resolution = line.match(/RESOLUTION=(\d+x\d+)/)[1];
                quality = resolution.split('x')[1] + 'p';
            } else if (line.endsWith('.m3u8')) {
                const videoUrl = new URL(url);
                videoUrl.pathname = videoUrl.pathname.replace(/\/[^\/]*$/, `/${line}`);
                videoList.push({
                    url: videoUrl.toString(),
                    originalUrl: videoUrl.toString(),
                    quality: `${serverName}: ${quality}`,
                    headers: { "Referer": url }
                });
            }
        }
        if (videoList.length === 0) {
            videoList.push({ url: url, originalUrl: url, quality: serverName + ": Auto", headers: { "Referer": url }});
        }
        return videoList;
    }

    // --- FILTERS ---
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
    
    // --- PREFERENCES ---
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