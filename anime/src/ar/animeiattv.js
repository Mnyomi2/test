// --- METADATA ---
const mangayomiSources = [{
    "name": "Animeiat TV",
    "id": 621985370,
    "baseUrl": "https://www.animeiat.tv",
    "apiUrl": "https://api.animegarden.net",
    "lang": "ar",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=https://www.animeiat.tv",
    "typeSource": "single",
    "itemType": 1,
    "version": "1.0.8",
    "pkgPath": "anime/src/ar/animeiattv.js"
}];

//     "baseUrl": "https://animegarden.net",
// --- CLASS ---
class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
        this.apiUrl = "https://api.animegarden.net/v1";
    }

    // --- HELPERS ---

    async apiRequest(endpoint) {
        const url = `${this.apiUrl}${endpoint}`;
        try {
            const res = await this.client.get(url);
            if (res.statusCode !== 200) return null;
            return JSON.parse(res.body);
        } catch (e) {
            console.error(`API request failed for endpoint: ${endpoint}`, e);
            return null;
        }
    }

    statusCode(status) {
        status = (status || "").toLowerCase().trim();
        return {
            "currently_airing": 0, "finished_airing": 1,
            "completed": 1, "not_yet_aired": 4
        }[status] ?? 5;
    }

    parseAnimeList(json) {
        const list = [];
        const animeData = json?.data?.animes?.data || json?.data?.data || json?.data;

        if (animeData) {
            animeData.forEach(item => {
                const imageUrl = typeof item.poster === 'string' ? item.poster : item.poster?.url;
                if (!imageUrl) return;

                list.push({ name: item.name, imageUrl: imageUrl, link: item.slug });
            });
        }
        const hasNextPage = !!(json && json.links && json.links.next);
        return { list, hasNextPage };
    }

    // --- CATALOGUE METHODS ---

    async getPopular(page) {
        const json = await this.apiRequest(`/anime?page=${page}`);
        return this.parseAnimeList(json);
    }

    async getLatestUpdates(page) {
        const json = await this.apiRequest(`/animeiat/home/sticky-episodes?page=${page}`);
        if (!json || !json.data) return { list: [], hasNextPage: false };

        const uniqueAnime = new Map();
        json.data.forEach(item => {
            const animeLink = item.slug.replace(/-episode-\d+$/, '');
            if (!uniqueAnime.has(animeLink)) {
                const animeName = item.title.replace(/\sالحلقة\s\d+\sمترجمة$/, '').trim();
                uniqueAnime.set(animeLink, { name: animeName, thumbnailUrl: item.poster.url });
            }
        });

        const slugsToFetch = Array.from(uniqueAnime.keys());
        const detailPromises = slugsToFetch.map(slug => this.apiRequest(`/anime/${slug}`));
        const detailResults = await Promise.all(detailPromises);

        const list = [];
        detailResults.forEach((detailJson, index) => {
            const slug = slugsToFetch[index];
            const initialData = uniqueAnime.get(slug);
            let imageUrl = initialData.thumbnailUrl;

            if (detailJson?.data?.poster) imageUrl = detailJson.data.poster.url;
            list.push({ name: initialData.name, imageUrl: imageUrl, link: slug });
        });

        const hasNextPage = !!(json.links && json.links.next);
        return { list, hasNextPage };
    }

    async search(query, page, filters) {
        let endpoint;
        if (query) {
            endpoint = `/animeiat/anime?search=${encodeURIComponent(query)}&page=${page}`;
        } else {
            const selectedGenre = filters[1].values[filters[1].state].value;
            const selectedYear = filters[2].values[filters[2].state].value;
            const selectedStudio = filters[3].values[filters[3].state].value;
            const selectedSeason = filters[4].values[filters[4].state].value;

            if (selectedGenre) {
                endpoint = `/animeiat/genres/${selectedGenre}?page=${page}`;
            } else if (selectedYear) {
                endpoint = `/animeiat/years/${selectedYear}?page=${page}`;
            } else if (selectedStudio) {
                endpoint = `/animeiat/studios/${selectedStudio}?page=${page}`;
            } else if (selectedSeason) {
                endpoint = `/animeiat/seasons/${selectedSeason}?page=${page}`;
            } else {
                endpoint = `/anime?page=${page}`;
            }
        }
        const json = await this.apiRequest(endpoint);
        return this.parseAnimeList(json);
    }

    // --- ANIME DETAIL & EPISODES ---

    async getDetail(url) {
        const mainJson = await this.apiRequest(`/anime/${url}`);
        if (!mainJson || !mainJson.data) throw new Error("Failed to retrieve anime details.");
        
        const data = mainJson.data;
        const animeId = data.id;
        const name = data.name;
        const imageUrl = data.poster.url;
        const description = (data.synopsis || "").replace(/<[^>]*>?/gm, '').trim();
        const genre = data.genres.map(g => g.name);
        const status = this.statusCode(data.status);
        const link = `${this.source.baseUrl}/anime/${url}`;

        const chapters = [];
        let page = 1;
        let hasNextPage = true;
        while (hasNextPage) {
            const episodesRes = await this.apiRequest(`/animeiat/anime/${animeId}/episodes?page=${page}`);
            if (!episodesRes?.data?.length) {
                hasNextPage = false;
                continue;
            }
            episodesRes.data.forEach(ep => chapters.push({ name: `الحلقة ${ep.number}`, url: ep.slug }));
            hasNextPage = !!(episodesRes.links && episodesRes.links.next);
            if (hasNextPage) page++;
        }
        chapters.reverse();

        return { name, imageUrl, description, genre, status, link, chapters };
    }

    // --- VIDEO EXTRACTION ---

    async getVideoList(url) {
        const json = await this.apiRequest(`/animeiat/episodes/${url}`);
        if (!json?.data?.video?.url) throw new Error("Video source not found for this episode.");
        const videoUrl = json.data.video.url;
        return [{ url: videoUrl, originalUrl: videoUrl, quality: "Default" }];
    }

    // --- FILTERS & PREFERENCES ---
    
    getFilterList() {
        const f = (name, value) => ({ type_name: "SelectOption", name, value });
        const all = f('الكل', '');
        
        let genres = [
            f("أكشن", "action"), f("طاقم بالغ", "adult-cast"), f("مغامرات", "adventure"),
            f("أنيميشن", "animation"), f("شخصيات حيوانية", "anthropomorphic"), f("طليعي", "avant-garde"),
            f("حائز على جوائز", "award-winning"), f("حب فتيان", "boys-love"), f("فتيات لطيفات يفعلن أشياء لطيفة", "cgdct"),
            f("رعاية أطفال", "childcare"), f("رياضات قتالية", "combat-sports"), f("كوميديا", "comedy"),
            f("تحقيق", "detective"), f("إيتشي", "ecchi"), f("تعليمي", "educational"),
            f("خيال", "fantasy"), f("فكاهة تهريجية", "gag-humor"), f("حب فتيات", "girls-love"),
            f("دموي", "gore"), f("طعام", "gourmet"), f("حريم", "harem"),
            f("لعبة مخاطرة عالية", "high-stakes-game"), f("تاريخي", "historical"), f("رعب", "horror"),
            f("آيدولز (إناث)", "idols-female-"), f("ايسيكاي", "isekai"), f("مريح للأعصاب", "iyashikei"),
            f("جوسي", "josei"), f("أطفال", "kids"), f("مثلث حب", "love-polygon"),
            f("علاقات معقدة", "love-status-quo"), f("سحر", "magic"), f("تحول جنسي سحري", "magical-sex-shift"),
            f("فتيات ساحرات", "mahou-shoujo"), f("فنون قتالية", "martial-arts"), f("ميكا", "mecha"),
            f("طبي", "medical"), f("عسكري", "military"), f("موسيقى", "music"), f("غموض", "mystery"),
            f("أساطير", "mythology"), f("جريمة منظمة", "organized-crime"), f("ثقافة الأوتاكو", "otaku-culture"),
            f("محاكاة ساخرة", "parody"), f("حيوانات أليفة", "pets"), f("نفسي", "psychological"), f("سباقات", "racing"),
            f("تجسد", "reincarnation"), f("حريم عكسي", "reverse-harem"), f("رومانسي", "romance"),
            f("ساموراي", "samurai"), f("مدرسي", "school"), f("خيال علمي", "sci-fi"), f("سينين", "seinen"),
            f("شوجو", "shoujo"), f("شونين", "shounen"), f("شريحة من الحياة", "slice-of-life"),
            f("فضاء", "space"), f("رياضة", "sports"), f("لعبة استراتيجية", "strategy-game"),
            f("قوى خارقة", "super-power"), f("خارق للطبيعة", "supernatural"), f("بقاء", "survival"),
            f("تشويق", "suspense"), f("رياضات جماعية", "team-sports"), f("سفر عبر الزمن", "time-travel"),
            f("خيال حضري", "urban-fantasy"), f("مصاص دماء", "vampire"), f("لعبة فيديو", "video-game"),
            f("شريرة", "villainess"), f("مكان العمل", "workplace"), f("دراما", "drama"),
        ];
        genres.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
        genres.unshift(all);

        const years = [ all,
            f("2025", "2025"), f("2024", "2024"), f("2023", "2023"), f("2022", "2022"),
            f("2021", "2021"), f("2020", "2020"), f("2019", "2019"), f("2018", "2018"),
            f("2017", "2017"), f("2016", "2016"), f("2015", "2015"), f("2014", "2014"),
            f("2013", "2013"), f("2012", "2012"), f("2008", "2008"), f("2007", "2007"),
            f("2006", "2006"), f("2005", "2005"), f("2003", "2003"), f("1999", "1999"),
            f("1996", "1996"), f("1990", "1990")
        ];

        let studios = [
            f("100studio", "100studio"), f("8bit", "8bit"), f("A-1 Pictures", "a-1-pictures"),
            f("AIC PLUS+", "aic-plus-"), f("AXsiZ", "axsiz"), f("Arvo Animation", "arvo-animation"),
            f("Asahi Production", "asahi-production"), f("Ashi Productions", "ashi-productions"),
            f("B.CMAY PICTURES", "b-cmay-pictures"), f("Bakken Record", "bakken-record"),
            f("Bandai Namco Pictures", "bandai-namco-pictures"), f("Bibury Animation Studios", "bibury-animation-studios"),
            f("Big Firebird Culture", "big-firebird-culture"), f("Blade", "blade"), f("Bones Film", "bones-film"),
            f("Brain's Base", "brain-s-base"), f("Bridge", "bridge"), f("C-Station", "c-station"),
            f("C2C", "c2c"), f("CloverWorks", "cloverworks"), f("CompTown", "comptown"), f("Connect", "connect"),
            f("CygamesPictures", "cygamespictures"), f("DR Movie", "dr-movie"), f("David Production", "david-production"),
            f("Digital Frontier", "digital-frontier"), f("Diomedéa", "diomed-a"), f("Doga Kobo", "doga-kobo"),
            f("Drive", "drive"), f("E&H Production", "e-h-production"), f("EMT Squared", "emt-squared"),
            f("ENGI", "engi"), f("East Fish Studio", "east-fish-studio"), f("Enishiya", "enishiya"),
            f("Felix Film", "felix-film"), f("GARDEN Culture", "garden-culture"), f("Ga-Crew", "ga-crew"),
            f("Geek Toys", "geek-toys"), f("Gekkou", "gekkou"), f("Geno Studio", "geno-studio"),
            f("GoHands", "gohands"), f("Hayabusa Film", "hayabusa-film"), f("J.C.Staff", "j-c-staff"),
            f("Kachigarasu", "kachigarasu"), f("Kamikaze Douga", "kamikaze-douga"), f("Khara", "khara"),
            f("Kinema Citrus", "kinema-citrus"), f("LAN Studio", "lan-studio"), f("LIDENFILMS", "lidenfilms"),
            f("LandQ studios", "landq-studios"), f("Lay-duce", "lay-duce"), f("Lerche", "lerche"),
            f("Lesprit", "lesprit"), f("M.S.C", "m-s-c"), f("MAPPA", "mappa"), f("Madhouse", "madhouse"),
            f("Maho Film", "maho-film"), f("Makaria", "makaria"), f("Marvy Jack", "marvy-jack"),
            f("Millepensee", "millepensee"), f("Nomad", "nomad"), f("Nut", "nut"), f("OLM", "olm"),
            f("Okuruto Noboru", "okuruto-noboru"), f("P.A. Works", "p-a-works"), f("PRA", "pra"),
            f("Paper Plane Animation Studio", "paper-plane-animation-studio"), f("Passione", "passione"),
            f("Pb Animation Co. Ltd.", "pb-animation-co-ltd-"), f("Pierrot", "pierrot"), f("Pierrot Films", "pierrot-films"),
            f("Platinum Vision", "platinum-vision"), f("Polygon Pictures", "polygon-pictures"), f("Production I.G", "production-i-g"),
            f("Production IMS", "production-ims"), f("Project No.9", "project-no-9"), f("Satelight", "satelight"),
            f("Science SARU", "science-saru"), f("Shaft", "shaft"), f("Shin-Ei Animation", "shin-ei-animation"),
            f("Shogakukan Music & Digital Entertainment", "shogakukan-music-digital-entertainment"), f("Shuka", "shuka"),
            f("Signal.MD", "signal-md"), f("Soigne", "soigne"), f("Sotsu", "sotsu"), f("Space Neko Company", "space-neko-company"),
            f("Staple Entertainment", "staple-entertainment"), f("Studio Bind", "studio-bind"), f("Studio Blanc.", "studio-blanc-"),
            f("Studio Clutch", "studio-clutch"), f("Studio Comet", "studio-comet"), f("Studio DURIAN", "studio-durian"),
            f("Studio Deen", "studio-deen"), f("Studio Elle", "studio-elle"), f("Studio Gokumi", "studio-gokumi"),
            f("Studio Hibari", "studio-hibari"), f("Studio Kai", "studio-kai"), f("Studio Moe", "studio-moe"),
            f("Studio Palette", "studio-palette"), f("Studio Signpost", "studio-signpost"), f("Studio VOLN", "studio-voln"),
            f("Sunrise", "sunrise"), f("SynergySP", "synergysp"), f("TMS Entertainment", "tms-entertainment"),
            f("TOHO animation STUDIO", "toho-animation-studio"), f("Tatsunoko Production", "tatsunoko-production"),
            f("Telecom Animation Film", "telecom-animation-film"), f("The Answer Studio", "the-answer-studio"),
            f("Toei Animation", "toei-animation"), f("TriF Studio", "trif-studio"), f("Trigger", "trigger"),
            f("Tsumugi Akita Animation Lab", "tsumugi-akita-animation-lab"), f("Typhoon Graphics", "typhoon-graphics"),
            f("Unend", "unend"), f("Vega Entertainment", "vega-entertainment"), f("Voil", "voil"), f("White Fox", "white-fox"),
            f("Wit Studio", "wit-studio"), f("WonderLand", "wonderland"), f("Yokohama Animation Laboratory", "yokohama-animation-laboratory"),
            f("Yostar Pictures", "yostar-pictures"), f("Zero-G", "zero-g"), f("asread.", "asread-"), f("feel.", "feel-"),
            f("studio MOTHER", "studio-mother")
        ];
        studios.sort((a, b) => a.name.localeCompare(b.name, 'en'));
        studios.unshift(all);
        
        let seasons = [
            f("شتاء 2025", "winter-2025"), f("شتاء 2024", "winter-2024"), f("شتاء 2022", "winter-2022"),
            f("شتاء 2021", "winter-2021"), f("شتاء 2020", "winter-2020"), f("شتاء 2019", "winter-2019"),
            f("شتاء 2018", "winter-2018"), f("شتاء 2017", "winter-2017"), f("شتاء 2016", "winter-2016"),
            f("شتاء 2015", "winter-2015"), f("شتاء 2013", "winter-2013"), f("شتاء 1996", "winter-1996"),
            f("صيف 2025", "summer-2025"), f("صيف 2024", "summer-2024"), f("صيف 2023", "summer-2023"),
            f("صيف 2022", "summer-2022"), f("صيف 2020", "summer-2020"), f("صيف 2019", "summer-2019"),
            f("صيف 2018", "summer-2018"), f("صيف 2017", "summer-2017"), f("صيف 2016", "summer-2016"),
            f("صيف 2005", "summer-2005"), f("صيف 2003", "summer-2003"), f("صيف 1990", "summer-1990"),
            f("ربيع 2025", "spring-2025"), f("ربيع 2024", "spring-2024"), f("ربيع 2022", "spring-2022"),
            f("ربيع 2020", "spring-2020"), f("ربيع 2019", "spring-2019"), f("ربيع 2018", "spring-2018"),
            f("ربيع 2017", "spring-2017"), f("ربيع 2016", "spring-2016"), f("ربيع 2015", "spring-2015"),
            f("ربيع 2014", "spring-2014"), f("ربيع 2013", "spring-2013"), f("ربيع 2012", "spring-2012"),
            f("ربيع 2008", "spring-2008"), f("خريف 2024", "fall-2024"), f("خريف 2023", "fall-2023"),
            f("خريف 2022", "fall-2022"), f("خريف 2021", "fall-2021"), f("خريف 2020", "fall-2020"),
            f("خريف 2019", "fall-2019"), f("خريف 2017", "fall-2017"), f("خريف 2015", "fall-2015"),
            f("خريف 2013", "fall-2013"), f("خريف 2007", "fall-2007"), f("خريف 2006", "fall-2006"),
            f("خريف 1999", "fall-1999")
        ];
        const seasonOrder = { "winter": 4, "fall": 3, "summer": 2, "spring": 1 };
        seasons.sort((a, b) => {
            const [seasonA, yearA] = a.value.split('-');
            const [seasonB, yearB] = b.value.split('-');
            if (yearA !== yearB) return parseInt(yearB) - parseInt(yearA);
            return seasonOrder[seasonA] - seasonOrder[seasonB];
        });
        seasons.unshift(all);

        return [
            { type_name: "HeaderFilter", name: "ملاحظة: يمكن استخدام فلتر واحد فقط في كل مرة." },
            { type_name: "SelectFilter", name: "التصنيف", state: 0, values: genres },
            { type_name: "SelectFilter", name: "السنة", state: 0, values: years },
            { type_name: "SelectFilter", name: "الاستوديو", state: 0, values: studios },
            { type_name: "SelectFilter", name: "الموسم", state: 0, values: seasons },
        ];
    }

    getSourcePreferences() {
        return [];
    }
}