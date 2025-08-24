// --- METADATA ---
const mangayomiSources = [{
    "name": "FreePornVideos",
    "id": 8739103845,
    "lang": "en",
    "baseUrl": "https://www.freepornvideos.xxx",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=freepornvideos.xxx",
    "typeSource": "single",
    "itemType": 1,
    "version": "1.4.2",
    "isNsfw": true,
    "pkgPath": "anime/src/en/freepornvideos.js"
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

    getBaseUrl() {
        return this.getPreference("override_base_url") || this.source.baseUrl;
    }

    getHeaders() {
        return {
            "Referer": this.getBaseUrl() + "/",
        };
    }

    // --- HELPERS ---
    parseItem(element) {
        const linkElement = element.selectFirst("a");
        if (!linkElement) return null;

        const title = linkElement.attr("title");
        const link = linkElement.getHref;
        
        let imageUrl = element.selectFirst("img.thumb").attr("data-src");
        if (!imageUrl || imageUrl.length === 0) {
            imageUrl = element.selectFirst("img.thumb").attr("src");
        }
        return { name: title, link, imageUrl };
    }

    // --- CORE METHODS ---
    async getPopular(page) {
        const path = page > 1 ? `/most-popular/${page}/` : '/most-popular/';
        const url = `${this.getBaseUrl()}${path}`;
        
        const res = await this.client.get(url, this.getHeaders());
        const doc = new Document(res.body);

        const items = doc.select("#list_videos_common_videos_list_items > div.item");
        const list = items.map(item => this.parseItem(item)).filter(item => item !== null);
        const hasNextPage = doc.selectFirst("li.next") != null;

        return { list, hasNextPage };
    }

    async getLatestUpdates(page) {
        const path = page > 1 ? `/latest-updates/${page}/` : '/latest-updates/';
        const url = `${this.getBaseUrl()}${path}`;

        const res = await this.client.get(url, this.getHeaders());
        const doc = new Document(res.body);

        const items = doc.select("#list_videos_latest_videos_list_items > div.item");
        const list = items.map(item => this.parseItem(item)).filter(item => item !== null);
        const hasNextPage = doc.selectFirst("li.next") != null;

        return { list, hasNextPage };
    }

    async search(query, page, filters) {
        const categoryFilter = filters && filters.length > 0 ? filters[0] : null;
        const selectedCategory = categoryFilter ? categoryFilter.values[categoryFilter.state].value : "";

        let url;
        let itemSelector;

        if (query) {
            const slug = query.trim().replace(/\s+/g, '-').toLowerCase();
            url = `${this.getBaseUrl()}/search/${slug}/${page}/`;
            itemSelector = "#custom_list_videos_videos_list_search_result_items > div.item";
        } else if (selectedCategory) {
            if (selectedCategory === "latest-updates") {
                 itemSelector = "#list_videos_latest_videos_list_items > div.item";
            } else {
                 itemSelector = "#list_videos_common_videos_list_items > div.item";
            }
            url = `${this.getBaseUrl()}/${selectedCategory}/${page}/`;
        } else {
            return { list: [], hasNextPage: false };
        }

        const res = await this.client.get(url, this.getHeaders());
        const doc = new Document(res.body);

        const items = doc.select(itemSelector);
        const list = items.map(item => this.parseItem(item)).filter(item => item !== null);
        const hasNextPage = doc.selectFirst("li.next") != null;

        return { list, hasNextPage };
    }

    async getDetail(url) {
        const res = await this.client.get(url, this.getHeaders());
        const doc = new Document(res.body);

        let name = doc.selectFirst("meta[property='og:title']")?.attr("content") ??
                   doc.selectFirst("div.headline > h1")?.text?.trim() ?? "";
                   
        const imageUrl = doc.selectFirst("meta[property='og:image']")?.attr("content") ?? "";
        let description = doc.selectFirst("meta[property='og:description']")?.attr("content") ?? "No description available.";

        const genre = [];
        const infoBlock = doc.selectFirst("div.block-details div.info");

        if (infoBlock) {
            infoBlock.select("div.item").forEach(item => {
                const spanText = item.selectFirst("span")?.text.trim();
                if (spanText === "Channel:" || spanText === "Network:" || spanText === "Categories:") {
                    item.select("a").forEach(a => genre.push(a.text.trim()));
                }
            });
        }
        
        if (description === "No description available.") {
             const descriptionDiv = doc.select("div.info-video > div").find(div => div.text.startsWith("Description:"));
             description = descriptionDiv?.selectFirst("em")?.text?.trim() ?? "No description available.";
        }

        const chapters = [{
            name: "Movie",
            url: url
        }];

        const uniqueGenres = [...new Set(genre)];
        return { name, imageUrl, description, genre: uniqueGenres, status: 1, chapters, link: url };
    }

    async getVideoList(url) {
        const res = await this.client.get(url, this.getHeaders());
        const doc = new Document(res.body);
        
        const videos = [];
        const sources = doc.select("video source");

        for (const source of sources) {
            videos.push({
                url: source.attr("src"),
                originalUrl: source.attr("src"),
                quality: source.attr("label"),
                headers: { "Referer": url }
            });
        }
        
        if (videos.length === 0) {
            throw new Error("No video sources found.");
        }

        videos.sort((a, b) => {
            const qualityA = parseInt(a.quality) || 0;
            const qualityB = parseInt(b.quality) || 0;
            return qualityB - qualityA;
        });

        return videos;
    }

    // --- FILTERS AND PREFERENCES ---
    getFilterList() {
        const f = (name, value) => ({ type_name: "SelectOption", name, value });
        return [
            {
                type_name: "SelectFilter",
                name: "Category",
                state: 0,
                values: [
                    f("None", ""),
                    f("Latest Updates", "latest-updates"),
                    f("Most Popular", "most-popular"),
                    f("Top Rated", "top-rated"),
                    // --- Networks & Sites ---
                    f("Adult Time", "networks/adult-time"),
                    f("BangBros", "networks/bangbros"),
                    f("BLACKED", "networks/blacked"),
                    f("Brazzers", "networks/brazzers-com"),
                    f("Deeper", "sites/deeper"),
                    f("Dorcel Club", "networks/dorcel-club"),
                    f("MOFOS", "networks/mofos-com"),
                    f("Mom Lover", "networks/mom-lover"),
                    f("MYLF", "networks/mylf-com"),
                    f("Naughty America", "networks/naughtyamerica-com"),
                    f("Nubiles Porn", "networks/nubiles-porn-com"),
                    f("Private", "networks/private"),
                    f("Reality Kings", "networks/rk-com"),
                    f("Team Skeet", "networks/teamskeet-com"),
                    f("TUSHY", "networks/tushy-com"),
                    f("Vixen", "sites/vixen"),
                    f("Woodman Casting", "networks/woodman-casting"),
                    f("WowPorn", "networks/wowporn"),
                    // --- Categories ---
                    f("18 Years Old", "categories/18-years-old"),
                    f("19 Years Old", "categories/19-years-old"),
                    f("4th of July", "categories/4th-of-july"),
                    f("50+", "categories/50"),
                    f("60+", "categories/60"),
                    f("69", "categories/69"),
                    f("Acoustic Intimacy", "categories/acoustic-intimacy"),
                    f("African", "categories/african"),
                    f("Amateur", "categories/amateur"),
                    f("Anal", "categories/anal"),
                    f("Anal Creampie", "categories/anal-creampie"),
                    f("Anal Play", "categories/anal-play"),
                    f("Animation", "categories/animation"),
                    f("Arab", "categories/arab"),
                    f("Asian", "categories/asian"),
                    f("Ass Fingering", "categories/ass-fingering"),
                    f("Ass Licking", "categories/ass-licking"),
                    f("Ass-To-Mouth", "categories/ass-to-mouth"),
                    f("Athletic", "categories/athletic"),
                    f("Audition", "categories/audition"),
                    f("Australian", "categories/australian"),
                    f("Babe", "categories/babe"),
                    f("Babysitter", "categories/babysitter"),
                    f("Ball Busting", "categories/ball-busting"),
                    f("Ball Licking", "categories/ball-licking"),
                    f("Ball Play", "categories/ball-play"),
                    f("Ball Sucking", "categories/ball-sucking"),
                    f("Ballerina", "categories/ballerina"),
                    f("Bathroom", "categories/bathroom"),
                    f("BBC (Big Black Cock)", "categories/bbc-big-black-cock"),
                    f("BBW", "categories/bbw"),
                    f("BDSM", "categories/bdsm"),
                    f("Beach", "categories/beach"),
                    f("Beautiful", "categories/beautiful"),
                    f("Beautiful Ass", "categories/beautifu-ass"),
                    f("Beautiful Sex", "categories/beautiful-sex"),
                    f("Behind the Scenes", "categories/behind-the-scenes"),
                    f("Best Friend", "categories/best-friend"),
                    f("Big Areolas", "categories/big-areolas"),
                    f("Big Ass", "categories/big-ass"),
                    f("Big Cock", "categories/big-cock"),
                    f("Big Natural Tits", "categories/big-natural-tits"),
                    f("Big Nipples", "categories/big-nipples"),
                    f("Big Tits", "categories/big-tits"),
                    f("Bikini", "categories/bikini"),
                    f("Bisexual", "categories/bisexual"),
                    f("Black", "categories/black"),
                    f("Blindfold", "categories/blindfold"),
                    f("Blonde", "categories/blonde"),
                    f("Blowjob", "categories/blowjob"),
                    f("Blue Eyes", "categories/blue-eyes"),
                    f("Bondage", "categories/bondage"),
                    f("Bra", "categories/bra"),
                    f("Braces", "categories/braces"),
                    f("Brazilian", "categories/brazilian"),
                    f("Breath Play", "categories/breath-play"),
                    f("Breeding Material", "categories/breeding-material"),
                    f("British", "categories/british"),
                    f("Brunette", "categories/brunette"),
                    f("Bubble Butt", "categories/bubble-butt"),
                    f("Bukkake", "categories/bukkake"),
                    f("Bulgarian", "categories/bulgarian"),
                    f("Bush", "categories/bush"),
                    f("Buttplug", "categories/buttplug"),
                    f("Cage", "categories/cage"),
                    f("Cameltoe", "categories/cameltoe"),
                    f("Canadian", "categories/canadian"),
                    f("Candaulism", "categories/candaulism"),
                    f("Car", "categories/car"),
                    f("Casting", "categories/casting"),
                    f("Cat Fights", "categories/cat-fights"),
                    f("Catholic", "categories/catholic"),
                    f("Celebrity", "categories/celebrity"),
                    f("CFNM", "categories/cfnm"),
                    f("Changing Room", "categories/changing-room"),
                    f("Cheating", "categories/cheating"),
                    f("Cheerleader", "categories/cheerleader"),
                    f("Chinese", "categories/chinese"),
                    f("Christmas", "categories/christmas"),
                    f("Close Up", "categories/close-up"),
                    f("College Girl", "categories/college-girl"),
                    f("Colombian", "categories/colombian"),
                    f("Compilation", "categories/compilation"),
                    f("Condom", "categories/condom"),
                    f("Cop", "categories/cop"),
                    f("Corporal Punishment", "categories/corporal-punishment"),
                    f("Cosplay", "categories/cosplay"),
                    f("Cougar", "categories/cougar"),
                    f("Couple", "categories/couple"),
                    f("Cowgirl", "categories/cowgirl"),
                    f("Creampie", "categories/creampie"),
                    f("Crying", "categories/crying"),
                    f("Cuckold", "categories/cuckold"),
                    f("Cum in Mouth", "categories/cum-in-mouth"),
                    f("Cum on Pussy", "categories/cum-on-pussy"),
                    f("Cum on Tits", "categories/cum-on-tits"),
                    f("Cum Swallowing", "categories/cum-swallowing"),
                    f("Cum Swapping", "categories/cum-swapping"),
                    f("Cumplay", "categories/cumplay"),
                    f("Cumshot", "categories/cumshot"),
                    f("Curly", "categories/curly"),
                    f("Czech", "categories/czech"),
                    f("Danish", "categories/danish"),
                    f("Deepthroat", "categories/deepthroat"),
                    f("Dildo", "categories/dildo"),
                    f("Doctor", "categories/doctor"),
                    f("Doggystyle", "categories/doggystyle"),
                    f("Domination", "categories/domination"),
                    f("Double Anal", "categories/double-anal"),
                    f("Double Blowjob", "categories/double-blowjob"),
                    f("Double Penetration", "categories/double-penetration"),
                    f("Double Pussy", "categories/double-pussy"),
                    f("Dutch", "categories/dutch"),
                    f("Ebony", "categories/ebony"),
                    f("Electricity Play", "categories/electricity-play"),
                    f("Emo", "categories/emo"),
                    f("Enhanced Body", "categories/enhanced-body"),
                    f("European", "categories/european"),
                    f("European Vacation", "categories/european-vacation"),
                    f("Exclusive", "categories/exclusive"),
                    f("Exhibitionist", "categories/exhibitionist"),
                    f("Face Sitting", "categories/face-sitting"),
                    f("Facefucking", "categories/facefucking"),
                    f("Facial", "categories/facial"),
                    f("Fair Skin", "categories/fair-skin"),
                    f("Fathers Day", "categories/fathers-day"),
                    f("Feet", "categories/feet"),
                    f("Female Orgasm", "categories/female-orgasm"),
                    f("Femdom", "categories/femdom"),
                    f("Fetish", "categories/fetish"),
                    f("FFF+", "categories/fff"),
                    f("FFFMM", "categories/fffmm"),
                    f("FFM", "categories/ffm"),
                    f("Fight", "categories/fight"),
                    f("Finger Licking", "categories/finger-licking"),
                    f("Fingering", "categories/fingering"),
                    f("First Anal", "categories/first-anal"),
                    f("First Time Porn", "categories/first-time-porn"),
                    f("First Time Sex", "categories/first-time-sex"),
                    f("Fishnet", "categories/fishnet"),
                    f("Fisting", "categories/fisting"),
                    f("Fitness", "categories/fitness"),
                    f("Flexible", "categories/flexible"),
                    f("Flogging", "categories/flogging"),
                    f("Foot Fetish", "categories/foot-fetish"),
                    f("Footjob", "categories/footjob"),
                    f("Foursome", "categories/foursome"),
                    f("FreeUse", "categories/freeuse"),
                    f("French", "categories/french"),
                    f("Fucking Machine", "categories/fucking-machine"),
                    f("Gagging", "categories/gagging"),
                    f("Gangbang", "categories/gangbang"),
                    f("Gaping", "categories/gaping"),
                    f("German", "categories/german"),
                    f("GILF", "categories/gilf"),
                    f("Girlfriend", "categories/girlfriend"),
                    f("Glasses", "categories/glasses"),
                    f("Gloryhole", "categories/gloryhole"),
                    f("Gonzo", "categories/gonzo"),
                    f("Goth", "categories/goth"),
                    f("Grandpa", "categories/grandpa"),
                    f("Granny", "categories/granny"),
                    f("Greek", "categories/greek"),
                    f("Group Sex", "categories/group-sex"),
                    f("Gym", "categories/gym"),
                    f("Gyno Exam", "categories/gyno-exam"),
                    f("Hairy", "categories/hairy"),
                    f("Hairy Bush", "categories/hairy-bush"),
                    f("Hairy Pussy", "categories/hairy-pussy"),
                    f("Halloween", "categories/halloween"),
                    f("Handjob", "categories/handjob"),
                    f("Hardcore", "categories/hardcore"),
                    f("HD", "categories/hd"),
                    f("High Heels", "categories/high-heels"),
                    f("Hijab", "categories/hijab"),
                    f("Horror", "categories/horror"),
                    f("Hotel", "categories/hotel"),
                    f("Housewife", "categories/housewife"),
                    f("Humiliation", "categories/humiliation"),
                    f("Hungarian", "categories/hungarian"),
                    f("Indian", "categories/indian"),
                    f("Interracial", "categories/interracial"),
                    f("Interview", "categories/interview"),
                    f("Iranian", "categories/iranian"),
                    f("Italian", "categories/italian"),
                    f("Japanese", "categories/japanese"),
                    f("JAV Censored", "categories/jav-censored"),
                    f("JAV Uncensored", "categories/jav-uncensored"),
                    f("JOI (Jerk Off Instructions)", "categories/joi-jerk-off-instructions"),
                    f("Kissing", "categories/kissing"),
                    f("Korean", "categories/korean"),
                    f("Lactating", "categories/lactating"),
                    f("Latex", "categories/latex"),
                    f("Latina", "categories/latina"),
                    f("Lesbian", "categories/lesbian"),
                    f("Lesbian In Threesome", "categories/lesbian-in-threesome"),
                    f("Lesdom", "categories/lesdom"),
                    f("Lingerie", "categories/lingerie"),
                    f("Lithuanian", "categories/lithuanian"),
                    f("Long Hair", "categories/long-hair"),
                    f("Maid", "categories/maid"),
                    f("Maledom", "categories/maledom"),
                    f("Massage", "categories/massage"),
                    f("Masturbation", "categories/masturbation"),
                    f("Mature", "categories/mature"),
                    f("Medical", "categories/medical"),
                    f("Medium Tits", "categories/medium-tits"),
                    f("Mexican", "categories/mexican"),
                    f("Midget", "categories/midget"),
                    f("MILF", "categories/milf"),
                    f("Military", "categories/military"),
                    f("Mind-Control", "categories/mind-control"),
                    f("Miniskirt", "categories/miniskirt"),
                    f("Missionary", "categories/missionary"),
                    f("MMF", "categories/mmf"),
                    f("MMFF", "categories/mmff"),
                    f("MMMF", "categories/mmmf"),
                    f("Mom", "categories/mom"),
                    f("Money", "categories/money"),
                    f("Mormon", "categories/mormon"),
                    f("Muscular", "categories/muscular"),
                    f("Natural Tits", "categories/natural-tits"),
                    f("Nipples", "categories/nipples"),
                    f("Nudist", "categories/nudist"),
                    f("Nurse", "categories/nurse"),
                    f("Office", "categories/office"),
                    f("Oiled", "categories/oiled"),
                    f("Old and Young", "categories/old-and-young"),
                    f("Orgy", "categories/orgy"),
                    f("Outdoor", "categories/outdoor"),
                    f("Pale", "categories/pale"),
                    f("Panties", "categories/panties"),
                    f("Pantyhose", "categories/pantyhose"),
                    f("Parody", "categories/parody"),
                    f("Party", "categories/party"),
                    f("Passionate", "categories/passionate"),
                    f("PAWG", "categories/pawg"),
                    f("Peeing", "categories/peeing"),
                    f("Petite", "categories/petite"),
                    f("Pick up", "categories/pick-up"),
                    f("Piercing", "categories/piercing"),
                    f("Pissing", "categories/pissing"),
                    f("Police", "categories/police"),
                    f("Polish", "categories/polish"),
                    f("Pool", "categories/pool"),
                    f("Pornstar", "categories/pornstar"),
                    f("Portuguese", "categories/portuguese"),
                    f("POV", "categories/pov"),
                    f("Pregnant", "categories/pregnant"),
                    f("Priest", "categories/priest"),
                    f("Prison", "categories/prison"),
                    f("Public", "categories/public"),
                    f("Puffy Nipples", "categories/puffy-nipples"),
                    f("Punished", "categories/punished"),
                    f("Pussy Licking", "categories/pussy-licking"),
                    f("Pussy to Mouth", "categories/pussy-to-mouth"),
                    f("Raw", "categories/raw"),
                    f("Reality", "categories/reality"),
                    f("Redhead", "categories/redhead"),
                    f("Religious", "categories/religious"),
                    f("Restraints", "categories/restraints"),
                    f("Reverse Cowgirl", "categories/reverse-cowgirl"),
                    f("Riding", "categories/riding"),
                    f("Rimming", "categories/rimming"),
                    f("Role Play", "categories/role-play"),
                    f("Rope Suspension", "categories/rope-suspension"),
                    f("Rough Sex", "categories/rough-sex"),
                    f("Russian", "categories/russian"),
                    f("School", "categories/school"),
                    f("Schoolgirl", "categories/schoolgirl"),
                    f("Scissoring", "categories/scissoring"),
                    f("Secretary", "categories/secretary"),
                    f("Seduced", "categories/seduced"),
                    f("Sex Doll", "categories/sex-doll"),
                    f("Sex Toys", "categories/sex-toys"),
                    f("Share", "categories/share"),
                    f("Shaved", "categories/shaved"),
                    f("Shaving", "categories/shaving"),
                    f("Shemale", "categories/shemale"),
                    f("Shemale Fuck Guy", "categories/shemale-fuck-guy"),
                    f("Shemale Fuck Shemale", "categories/shemale-fuck-shemale"),
                    f("Shemale Threesome", "categories/shemale-threesome"),
                    f("Short Hair", "categories/short-hair"),
                    f("Shower", "categories/shower"),
                    f("Skinny", "categories/skinny"),
                    f("Skirt", "categories/skirt"),
                    f("Slave", "categories/slave"),
                    f("Sloppy", "categories/sloppy"),
                    f("Small Tits", "categories/small-tits"),
                    f("Smoking", "categories/smoking"),
                    f("Socks", "categories/socks"),
                    f("Softcore", "categories/softcore"),
                    f("Solo", "categories/solo"),
                    f("Spandex", "categories/spandex"),
                    f("Spanish", "categories/spanish"),
                    f("Spanking", "categories/spanking"),
                    f("Spit Roast", "categories/spit-roast"),
                    f("Spooning", "categories/spooning"),
                    f("Sport", "categories/sport"),
                    f("Sportsball", "categories/sportsball"),
                    f("Spycam", "categories/spycam"),
                    f("Squirt", "categories/squirt"),
                    f("St. Patrick's Day", "categories/st-patrick-s-day"),
                    f("Step Fantasy", "categories/step-fantasy"),
                    f("Stepbrother", "categories/stepbrother"),
                    f("Stepdad", "categories/stepdad"),
                    f("Stepdaughter", "categories/stepdaughter"),
                    f("Stepfamily", "categories/stepfamily"),
                    f("Stepmom", "categories/stepmom"),
                    f("Stepsister", "categories/stepsister"),
                    f("Stepson", "categories/stepson"),
                    f("Stockings", "categories/stockings"),
                    f("Strap-on", "categories/strap-on"),
                    f("Striptease", "categories/striptease"),
                    f("Stuck", "categories/stuck"),
                    f("Super Skinny", "categories/super-skinny"),
                    f("Suspenders", "categories/suspenders"),
                    f("Swap", "categories/swap"),
                    f("Swinger", "categories/swinger"),
                    f("Taboo", "categories/taboo"),
                    f("Tall Girls", "categories/tall-girls"),
                    f("Tan Lines", "categories/tan-lines"),
                    f("Tanned", "categories/tanned"),
                    f("Tattoo", "categories/tattoo"),
                    f("Taxi", "categories/taxi"),
                    f("Teacher", "categories/teacher"),
                    f("Teen", "categories/teen"),
                    f("Tentacles", "categories/tentacles"),
                    f("Thai", "categories/thai"),
                    f("Thanksgiving", "categories/thanksgiving"),
                    f("Thong", "categories/thong"),
                    f("Threesome", "categories/threesome"),
                    f("Tied Up", "categories/tied-up"),
                    f("Titty Fuck", "categories/titty-fuck"),
                    f("Toe Sucking", "categories/toe-sucking"),
                    f("Trimmed", "categories/trimmed"),
                    f("Turkish", "categories/turkish"),
                    f("Twins", "categories/twins"),
                    f("Ukrainian", "categories/ukrainian"),
                    f("Uniform", "categories/uniform"),
                    f("Upskirt", "categories/upskirt"),
                    f("Valentine's day", "categories/valentine-s-day"),
                    f("Vergin", "categories/vergin"),
                    f("Vibrator", "categories/vibrator"),
                    f("Vietnamese", "categories/vietnamese"),
                    f("Vintage", "categories/vintage"),
                    f("Voyeur", "categories/voyeur"),
                    f("VR (Virtual Reality)", "categories/vr-virtual-reality"),
                    f("Watching", "categories/watching"),
                    f("Webcam", "categories/webcam"),
                    f("Wet", "categories/wet"),
                    f("Wife", "categories/wife"),
                    f("Worship", "categories/worship"),
                    f("Wrestling", "categories/wrestling"),
                    f("Yoga", "categories/yoga"),
                    f("Young", "categories/young"),
                ]
            }
        ];
    }

    getSourcePreferences() {
        return [{
            key: "override_base_url",
            editTextPreference: {
                title: "Override Base URL",
                summary: "For temporary changes...",
                value: this.source.baseUrl,
                dialogTitle: "Override Base URL",
                dialogMessage: `Default: ${this.source.baseUrl}`,
            }
        }];
    }
}