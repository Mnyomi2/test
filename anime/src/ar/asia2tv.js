// --- METADATA ---
const mangayomiSources = [{
    "name": "Asia2TV",
    "id": 8374928475,
    "lang": "ar",
    "baseUrl": "https://ww1.asia2tv.pw",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=ww1.asia2tv.pw",
    "typeSource": "single",
    "itemType": 1,
    "version": "1.0.0",
    "pkgPath": "anime/src/ar/asia2tv.js"
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

    getHeaders(url) {
        return {
            "Referer": this.source.baseUrl,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36"
        };
    }

    // --- POPULAR ---

    async getPopular(page) {
        const url = `${this.source.baseUrl}/category/asian-drama/page/${page}/`;
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);

        const list = [];
        const items = doc.select("div.postmovie-photo a[title]");
        for (const item of items) {
            const link = item.getHref.replace(this.source.baseUrl, "");
            const name = item.attr("title");
            // Thumbnail is fetched in getDetail
            list.push({ name, link });
        }

        const hasNextPage = doc.selectFirst("div.nav-links a.next") != null;
        return { list, hasNextPage };
    }

    // --- LATEST ---

    // The source doesn't have a clear, paginated latest episode list.
    // getPopular serves a similar purpose (recently added dramas).
    get supportsLatest() {
        return false;
    }

    async getLatestUpdates(page) {
        throw new Error("Not supported");
    }

    // --- SEARCH & FILTERS ---

    async search(query, page, filters) {
        let url;
        if (query) {
            url = `${this.source.baseUrl}/page/${page}/?s=${encodeURIComponent(query)}`;
        } else {
            const typeFilter = filters.find(f => f.name === "نوع الدراما");
            const statusFilter = filters.find(f => f.name === "حالة الدراما");
            
            let filterPath = "";
            if (typeFilter && typeFilter.state > 0) {
                filterPath = `/category/asian-drama/${typeFilter.values[typeFilter.state].value}/page/${page}/`;
            } else if (statusFilter && statusFilter.state > 0) {
                filterPath = `/${statusFilter.values[statusFilter.state].value}/page/${page}/`;
            }

            if (filterPath) {
                url = `${this.source.baseUrl}${filterPath}`;
            } else {
                throw new Error("اختر فلترًا عند البحث بدون نص");
            }
        }

        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);
        
        const list = [];
        const items = doc.select("div.postmovie-photo a[title]");
        for (const item of items) {
            const link = item.getHref.replace(this.source.baseUrl, "");
            const name = item.attr("title");
            list.push({ name, link });
        }
        
        const hasNextPage = doc.selectFirst("div.nav-links a.next") != null;
        return { list, hasNextPage };
    }

    // --- DETAILS ---

    async getDetail(url) {
        const res = await this.client.get(this.source.baseUrl + url, this.getHeaders(this.source.baseUrl + url));
        const doc = new Document(res.body);
        
        const name = doc.selectFirst("h1 span.title").text;
        const imageUrl = doc.selectFirst("div.single-thumb-bg > img").getSrc;
        const description = doc.selectFirst("div.getcontent p").text;
        const genre = doc.select("div.box-tags a, li:contains(البلد) a").map(e => e.text);
        
        const chapters = [];
        const episodeElements = doc.select("div.loop-episode a");
        for (const element of episodeElements) {
            const epUrl = element.getHref.replace(this.source.baseUrl, "");
            const epNum = epUrl.substringAfterLast("-").substringBeforeLast("/");
            chapters.push({
                name: `الحلقة : ${epNum}`,
                url: epUrl
            });
        }
        chapters.reverse();

        return { name, imageUrl, description, genre, chapters, link: url };
    }

    // --- VIDEO LIST ---

    async yodboxExtractor(url) {
        try {
            const res = await this.client.get(url, this.getHeaders(url));
            const doc = new Document(res.body);
            const videoUrl = doc.selectFirst("source")?.getSrc;
            if (videoUrl) {
                return [{ url: videoUrl, quality: "Yodbox", originalUrl: videoUrl }];
            }
        } catch (e) {
            // Do nothing
        }
        return [];
    }

    async getVideoList(url) {
        // This source has a two-step process to get to the server page.
        const initialRes = await this.client.get(this.source.baseUrl + url, this.getHeaders(this.source.baseUrl + url));
        const initialDoc = new Document(initialRes.body);
        const serverPageUrl = initialDoc.selectFirst("div.loop-episode a.current")?.getHref;

        if (!serverPageUrl) {
            throw new Error("Could not find the server page link.");
        }
        
        const res = await this.client.get(serverPageUrl, this.getHeaders(serverPageUrl));
        const doc = new Document(res.body);
        let videos = [];
        const headers = this.getHeaders(serverPageUrl);

        const serverElements = doc.select("ul.server-list-menu li");
        for (const element of serverElements) {
            const embedUrl = element.attr("data-server");
            const serverName = element.text;

            if (embedUrl.includes("dood") || embedUrl.includes("ds2play")) {
                videos.push({ url: embedUrl, quality: `Dood - ${serverName}`, headers });
            } else if (embedUrl.includes("ok.ru") || embedUrl.includes("odnoklassniki")) {
                videos.push({ url: embedUrl, quality: `Okru - ${serverName}`, headers });
            } else if (embedUrl.includes("streamtape")) {
                videos.push({ url: embedUrl, quality: `StreamTape - ${serverName}`, headers });
            } else if (embedUrl.includes("streamwish") || embedUrl.includes("fviplions") || embedUrl.includes("filelions") || embedUrl.includes("dwish")) {
                videos.push({ url: embedUrl, quality: `StreamWish - ${serverName}`, headers });
            } else if (embedUrl.includes("uqload")) {
                videos.push({ url: embedUrl, quality: `Uqload - ${serverName}`, headers });
            } else if (embedUrl.includes("vidbam") || embedUrl.includes("vadbam") || embedUrl.includes("vidbom") || embedUrl.includes("vidbm")) {
                videos.push({ url: embedUrl, quality: `VidBom - ${serverName}`, headers });
            } else if (embedUrl.includes("youdbox") || embedUrl.includes("yodbox")) {
                const yodboxVideos = await this.yodboxExtractor(embedUrl);
                videos.push(...yodboxVideos);
            }
        }

        return this.sortVideos(videos);
    }
    
    sortVideos(videos) {
        const quality = this.getPreference("preferred_quality");
        if (quality) {
            videos.sort((a, b) => {
                const aIsPreferred = a.quality.includes(quality);
                const bIsPreferred = b.quality.includes(quality);
                if (aIsPreferred && !bIsPreferred) return -1;
                if (!aIsPreferred && bIsPreferred) return 1;
                return 0; // Keep original order for same-level priorities
            });
        }
        return videos;
    }

    // --- FILTERS & PREFERENCES ---

    getFilterList() {
        const f = (name, value) => ({ type_name: "SelectOption", name, value });

        const types = [
            f("اختر", ""),
            f("الدراما الكورية", "korean"),
            f("الدراما اليابانية", "japanese"),
            f("الدراما الصينية والتايوانية", "chinese-taiwanese"),
            f("الدراما التايلاندية", "thai"),
            f("برامج الترفيه", "kshow")
        ];

        const statuses = [
            f("أختر", ""),
            f("يبث حاليا", "status/ongoing-drama"),
            f("الدراما المكتملة", "completed-dramas"),
            f("الدراما القادمة", "status/upcoming-drama")
        ];

        return [
            { type_name: "HeaderFilter", name: "لا تعمل الفلاتر عند استخدام البحث النصي." },
            { type_name: "SelectFilter", name: "نوع الدراما", state: 0, values: types },
            { type_name: "SelectFilter", name: "حالة الدراما", state: 0, values: statuses }
        ];
    }
    
    getSourcePreferences() {
        return [{
            key: "preferred_quality",
            listPreference: {
                title: "الجودة والسيرفر المفضل",
                summary: "اختر الجودة أو السيرفر الذي سيظهر في الأعلى",
                valueIndex: 2, // Default to 1080p
                entries: ["StreamTape", "DoodStream", "1080p", "720p", "480p", "360p"],
                entryValues: ["StreamTape", "Dood", "1080", "720", "480", "360"],
            }
        }];
    }
}