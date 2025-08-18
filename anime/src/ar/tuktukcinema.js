// --- METADATA ---
const mangayomiSources = [{
    "name": "Tuktukcinema",
    "id": 483920173,
    "lang": "ar",
    "baseUrl": "https://tuk.cam",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=tuk.cam",
    "typeSource": "single",
    "itemType": 1,
    "version": "1.0.0",
    "pkgPath": "anime/src/ar/tuktukcinema.js"
}];

// --- CLASS ---
class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    // --- HELPER METHODS ---

    /**
     * A helper function to parse catalogue pages (popular, latest, search).
     * @param {string} url - The full URL of the page to parse.
     * @returns {Promise<{list: {name: string, link: string, imageUrl: string}[], hasNextPage: boolean}>}
     */
    async parseCataloguePage(url) {
        const res = await this.client.get(url);
        const doc = new Document(res.body);
        const list = [];
        const items = doc.select("div.Block--Item");

        items.forEach(item => {
            const linkElement = item.selectFirst("a");
            if (!linkElement) return;

            const name = linkElement.selectFirst("h3").text;
            const link = linkElement.getHref;
            const imageUrl = linkElement.selectFirst("img").getSrc;
            list.push({ name, link, imageUrl });
        });

        const hasNextPage = !!doc.selectFirst("a.next.page-numbers");
        return { list, hasNextPage };
    }

    // --- CORE METHODS ---

    async getPopular(page) {
        const url = `${this.source.baseUrl}/category/movies/?page=${page}`;
        return this.parseCataloguePage(url);
    }

    async getLatestUpdates(page) {
        const url = `${this.source.baseUrl}/recent/page/${page}/`;
        const result = await this.parseCataloguePage(url);
        
        // The "latest" page lists episodes, so we need to convert them to series entries.
        const fixedList = result.list.map(item => {
            let link = item.link;
            let name = item.name;

            // Check if the title indicates it's an episode
            if (name.match(/الموسم|الحلقة/)) {
                 // Try to construct the series name by removing episode details
                const seriesNameMatch = name.match(/(.*?) الموسم .* الحلقة .*/);
                if (seriesNameMatch) {
                    name = seriesNameMatch[1].replace('مشاهدة', '').trim();
                }

                // Construct the series link by cleaning the episode link
                if (link.includes('/مشاهدة-')) {
                   link = link.replace('/مشاهدة-', '/');
                }
                link = link.replace(/-الحلقة-.*/, '/');
            }
            return { ...item, name, link };
        });

        return { list: fixedList, hasNextPage: result.hasNextPage };
    }

    async search(query, page, filters) {
        const url = `${this.source.baseUrl}/page/${page}/?s=${encodeURIComponent(query)}`;
        return this.parseCataloguePage(url);
    }

    async getDetail(url) {
        const res = await this.client.get(url);
        const doc = new Document(res.body);

        const name = doc.selectFirst("h1.Title--Single").text.trim();
        const imageUrl = doc.selectFirst("div.Poster--Single--Box img").getSrc;
        const description = doc.selectFirst("div.Story--Single p")?.text.trim() ?? "";
        const genre = doc.select("ul.Terms--Single--Box a").map(e => e.text);

        let status = 5; // Unknown
        const statusElement = doc.selectFirst("div.Meta--Single--Box:contains(الحالة)");
        if (statusElement) {
            const statusText = statusElement.selectFirst("span").text;
            if (statusText.includes("مستمر")) status = 0; // Ongoing
            if (statusText.includes("منتهي")) status = 1; // Completed
        }

        const chapters = [];
        const relativeUrl = url.replace(this.source.baseUrl, '');

        if (name.includes("فيلم")) { // It's a Movie
            const watchUrl = `/watch${relativeUrl.replace(/\/$/, '')}/`;
            chapters.push({ name: "فيلم", url: watchUrl });
            status = 1; // Movies are considered completed
        } else { // It's a Series
            doc.select("div.Episodes--Seasons--Episodes li a").forEach(ep => {
                chapters.push({
                    name: ep.text.trim(),
                    url: ep.getHref.replace(this.source.baseUrl, '')
                });
            });
        }
        chapters.reverse();

        return { name, imageUrl, description, genre, status, link: url, chapters };
    }

    async getVideoList(url) {
        const fullUrl = this.source.baseUrl + url;
        const res = await this.client.get(fullUrl);
        const doc = new Document(res.body);

        const videos = [];
        const serverElements = doc.select("ul.Servers--List li a");
        const ajaxUrl = `${this.source.baseUrl}/wp-admin/admin-ajax.php`;
        const headers = { "Referer": fullUrl };

        for (const el of serverElements) {
            const serverId = el.attr("data-id");
            const serverName = el.text.trim();

            try {
                const formData = { "action": "get_player_content", "id": serverId };
                const ajaxRes = await this.client.post(ajaxUrl, headers, formData);
                const ajaxJson = JSON.parse(ajaxRes.body);

                if (ajaxJson.success && ajaxJson.data) {
                    const iframeDoc = new Document(ajaxJson.data);
                    const iframeSrc = iframeDoc.selectFirst("iframe")?.getSrc;

                    if (iframeSrc) {
                        videos.push({
                            url: iframeSrc,
                            originalUrl: iframeSrc,
                            quality: serverName,
                            headers: headers // Pass referer to the webview
                        });
                    }
                }
            } catch (e) {
                console.log(`Failed to fetch server: ${serverName}`);
            }
        }

        if (videos.length === 0) {
            throw new Error("No videos found.");
        }

        return videos;
    }

    // --- FILTERS (Not implemented as none were apparent on the site) ---
    getFilterList() {
        return [];
    }
}
