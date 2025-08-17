import 'package:mangayomi/bridge_lib.dart';

class HentaiTorrents extends MProvider {
  HentaiTorrents({required this.source});

  MSource source;

  final Client client = Client();

  @override
  Future<MPages> getPopular(int page) async {
    final url = page == 1 ? getBaseUrl() : "${getBaseUrl()}/page/$page";
    final res = (await client.get(Uri.parse(url))).body;
    return parseAnimeList(res);
  }

  @override
  Future<MPages> getLatestUpdates(int page) async {
    // The site's homepage (popular) also serves as the latest updates.
    return getPopular(page);
  }

  @override
  Future<MPages> search(String query, int page, FilterList filterList) async {
    final url =
        "${getBaseUrl()}/?q=${Uri.encodeComponent(query)}&f_page=$page";
    final res = (await client.get(Uri.parse(url))).body;
    return parseAnimeList(res);
  }

  @override
  Future<MManga> getDetail(String url) async {
    MManga anime = MManga();
    final res = (await client.get(Uri.parse(url))).body;
    final document = parseHtml(res);

    anime.name = document.selectFirst("div.container > h1")?.text ?? "";
    anime.imageUrl = document.selectFirst("div.container > img")?.getSrc ?? "";

    final articleContentElement = document.selectFirst("div.article-content");
    if (articleContentElement != null) {
      final articleText = articleContentElement.text;

      final descMatch = RegExp(r'Description\s*:\s*([\s\S]*)', caseSensitive: false).firstMatch(articleText);
      anime.description = descMatch?.group(1)?.trim() ?? articleText.trim();

      final genreMatch = RegExp(r'Genre\s*:\s*([^\r\n]+)').firstMatch(articleText);
      if (genreMatch != null) {
        final genreString = genreMatch.group(1) ?? "";
        anime.genre = genreString.split(',').map((e) => e.trim()).toList();
      }
    }

    List<MChapter> chapters = [];
    final downloadElement = document.selectFirst("div.download-container a.download-button");
    if (downloadElement != null) {
      final epUrl = downloadElement.getHref;
      if (epUrl.isNotEmpty) {
        chapters.add(
          MChapter(
            name: "Download Torrent",
            url: getAbsoluteUrl(epUrl),
          ),
        );
      }
    }
    anime.chapters = chapters;
    anime.status = MStatus.completed;

    return anime;
  }

  @override
  Future<List<MVideo>> getVideoList(String url) async {
    final res = (await client.get(Uri.parse(url))).body;
    final document = parseHtml(res);
    final torrentLinkElement = document.selectFirst("div.container a.download-button");
    
    if (torrentLinkElement != null) {
      final torrentUrl = torrentLinkElement.getHref;
      if (torrentUrl.isNotEmpty) {
        return [
          MVideo(url: torrentUrl, originalUrl: torrentUrl, quality: "Torrent")
        ];
      }
    }
    return [];
  }

  MPages parseAnimeList(String res) {
    List<MManga> animeList = [];
    final document = parseHtml(res);

    final items = document.select("div.image-wrapper");
    for (var item in items) {
      MManga anime = MManga();
      anime.name = item.selectFirst("a.overlay")?.text ?? "";
      final link = item.selectFirst("a.overlay")?.getHref ?? "";
      if (link.isNotEmpty) {
        anime.link = getAbsoluteUrl(link);
      }
      anime.imageUrl = item.selectFirst("img")?.getSrc ?? "";
      if (anime.name.isNotEmpty && anime.link.isNotEmpty) {
        animeList.add(anime);
      }
    }

    return MPages(animeList, animeList.isNotEmpty);
  }
  
  String getBaseUrl() {
    return source.baseUrl;
  }
  
  String getAbsoluteUrl(String url) {
    if (url.startsWith("http")) {
      return url;
    }
    return "${getBaseUrl()}${url.startsWith('/') ? url : '/$url'}";
  }

  @override
  List<dynamic> getFilterList() {
    return [];
  }

  @override
  List<dynamic> getSourcePreferences() {
    return [];
  }
}

HentaiTorrents main(MSource source) {
  return HentaiTorrents(source: source);
}
