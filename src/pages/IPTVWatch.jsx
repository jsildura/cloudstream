import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import shaka from 'shaka-player';
import './IPTVWatch.css';

const OFFLINE_CHANNELS_KEY = 'iptv_offline_channels';
const M3U_URL = 'https://viplaylist.vercel.app/cignal.m3u';

/**
 * Parse M3U playlist into channel objects (duplicated from IPTV.jsx for direct URL loading)
 */
const parseM3U = (content) => {
    const lines = content.split('\n');
    const channels = [];
    let pendingLicenseKey = null;
    let pendingLicenseType = null;
    let pendingExtinf = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (line.startsWith('#KODIPROP:inputstream.adaptive.license_type=')) {
            pendingLicenseType = line.split('=')[1];
        } else if (line.startsWith('#KODIPROP:inputstream.adaptive.license_key=')) {
            pendingLicenseKey = line.split('=')[1];
        } else if (line.startsWith('#EXTINF:')) {
            if (line.includes('group-title="TVPass"')) {
                pendingExtinf = { skip: true };
            } else {
                const logoMatch = line.match(/tvg-logo="([^"]*)"/);
                const groupMatch = line.match(/group-title="([^"]*)"/);
                const nameMatch = line.match(/,(.+)$/);
                pendingExtinf = {
                    name: nameMatch ? nameMatch[1].trim() : null,
                    logo: logoMatch ? logoMatch[1] : null,
                    category: groupMatch ? groupMatch[1] : 'Entertainment',
                    skip: false
                };
            }
        } else if (line && !line.startsWith('#')) {
            if (pendingExtinf?.skip) {
                pendingLicenseKey = null;
                pendingLicenseType = null;
                pendingExtinf = null;
                continue;
            }

            let channelName = pendingExtinf?.name;
            let channelLogo = pendingExtinf?.logo;
            let mappleId = null;

            const mappleMatch = line.match(/premium(\d+)/);
            if (mappleMatch) {
                mappleId = mappleMatch[1];
            }

            if (!channelName) {
                const urlMatch = line.match(/\/bpk-tv\/([^/]+)\//);
                if (urlMatch) {
                    channelName = urlMatch[1]
                        .replace(/^cg_/, '')
                        .replace(/_/g, ' ')
                        .replace(/\b\w/g, l => l.toUpperCase());
                } else {
                    channelName = `Channel ${channels.length + 1}`;
                }
            }

            channels.push({
                id: channels.length,
                name: channelName,
                logo: channelLogo,
                category: pendingExtinf?.category || 'Entertainment',
                url: line,
                licenseType: pendingLicenseKey ? 'clearkey' : null,
                licenseKey: pendingLicenseKey,
                mappleId: mappleId
            });

            pendingLicenseKey = null;
            pendingLicenseType = null;
            pendingExtinf = null;
        }
    }

    return channels;
};

/**
 * Get manual channels (subset needed for direct URL loading - includes all manual channel IDs)
 */
const getManualChannels = () => [
    { id: 'cinema-one', name: 'Cinema One', logo: 'https://download.logo.wine/logo/Cinema_One/Cinema_One-Logo.wine.png', category: 'Movies', url: 'https://d9rpesrrg1bdi.cloudfront.net/out/v1/93b9db7b231d45f28f64f29b86dc6c65/index.mpd', licenseKey: '58d0e56991194043b8fb82feb4db7276:d68f41b59649676788889e19fb10d22c' },
    { id: 'bbc-earth', name: 'BBC Earth', logo: 'https://upload.wikimedia.org/wikipedia/commons/3/3f/BBC_Earth.svg', category: 'Documentary', url: 'https://qp-pldt-live-bpk-01-prod.akamaized.net/bpk-tv/cg_bbcearth_hd1/default/index.mpd', licenseKey: '34ce95b60c424e169619816c5181aded:0e2a2117d705613542618f58bf26fc8e' },
    { id: 'axn', name: 'AXN', logo: 'https://icon2.cleanpng.com/20180702/pfc/kisspng-axn-television-channel-sony-channel-television-sho-axn-5b3a0ac39f5e85.1062681315305304996528.jpg', category: 'Entertainment', url: 'https://qp-pldt-live-bpk-02-prod.akamaized.net/bpk-tv/cg_axn_sd/default/index.mpd', licenseKey: 'fd5d928f5d974ca4983f6e9295dfe410:3aaa001ddc142fedbb9d5557be43792f' },
    { id: 'bbc-impossible', name: 'BBC Impossible', logo: 'https://i.imgur.com/IlIPwWV.png', category: 'Entertainment', url: 'https://bbc-impossible-1-us.xumo.wurl.tv/4300.m3u8' },
    { id: 'amc-thrillers', name: 'AMC Thrillers', logo: 'https://provider-static.plex.tv/6/epg/channels/logos/gracenote/6e7af423114c9f735d17e142783f233a.png', category: 'Movies', url: 'https://436f59579436473e8168284cac5d725f.mediatailor.us-east-1.amazonaws.com/v1/master/44f73ba4d03e9607dcd9bebdcb8494d86964f1d8/Plex_RushByAMC/playlist.m3u8' },
    { id: 'anime-hidive', name: 'Anime X Hidive', logo: 'https://www.tablotv.com/wp-content/uploads/2023/12/AnimeXHIDIVE_official-768x499.png', category: 'Kids', url: 'https://amc-anime-x-hidive-1-us.tablo.wurl.tv/playlist.m3u8' },
    { id: 'animex', name: 'AnimeX', logo: 'https://logomakerr.ai/uploads/output/2023/08/01/8d87f4803925f46fcdb6b9ae8a1e6244.jpg', category: 'Kids', url: 'https://live20.bozztv.com/giatv/giatv-animex/animex/chunks.m3u8' },
    { id: 'angry-birds', name: 'Angry Birds', logo: 'https://www.pikpng.com/pngl/m/83-834869_angry-birds-theme-angry-birds-game-logo-png.png', category: 'Kids', url: 'https://stream-us-east-1.getpublica.com/playlist.m3u8?network_id=547' },
    { id: 'kidoodle', name: 'Kidoodle TV', logo: 'https://d1iiooxwdowqwr.cloudfront.net/pub/appsubmissions/20201230211817_FullLogoColor4x.png', category: 'Kids', url: 'https://amg07653-apmc-amg07653c5-samsung-ph-8539.playouts.now.amagi.tv/playlist.m3u8' },
    { id: 'abc-australia', name: 'ABC Australia', logo: 'https://i.pinimg.com/736x/5a/66/65/5a666508bc5851a6a9c1151e7eefff3d.jpg', category: 'News', url: 'https://qp-pldt-live-bpk-02-prod.akamaized.net/bpk-tv/abc_aus/default/index.mpd', licenseKey: '389497f9f8584a57b234e27e430e04b7:3b85594c7f88604adf004e45c03511c0' },
    { id: 'amc-plus', name: 'AMC+', logo: 'https://shop.amc.com/cdn/shop/products/AMCP-LOGO-100011-FR-RO_1500x.png?v=1650990755', category: 'Entertainment', url: 'https://bcovlive-a.akamaihd.net/ba853de442c140b7b3dc020001597c0a/us-east-1/6245817279001/profile_0/chunklist.m3u8' },
    { id: 'anc', name: 'ANC', logo: 'https://data-corporate.abs-cbn.com/corp/medialibrary/dotcom/corp news sports 2020/anc station id/anc goes global_2.jpg', category: 'News', url: 'https://d3cjss68xc4sia.cloudfront.net/out/v1/89ea8db23cb24a91bfa5d0795f8d759e/index.mpd', licenseKey: '4bbdc78024a54662854b412d01fafa16:6039ec9b213aca913821677a28bd78ae' },
    { id: 'gma7', name: 'GMA 7', logo: 'https://ottepg8.comclark.com:8443/iptvepg/images/markurl/mark_1723126306082.png', category: 'Pinoy', url: 'https://gsattv.akamaized.net/live/media0/gma7/Widevine/gma7.mpd' },
    { id: 'red-bull', name: 'Red Bull TV', logo: 'https://i.imgur.com/Ju6FJNA.png', category: 'Sports', url: 'https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master_3360.m3u8' },
    { id: 'uaap-varsity-channel', name: 'UAAP Varsity Channel', logo: 'https://i.imgur.com/V0sxXci.png', category: 'Sports', url: 'https://qp-pldt-live-bpk-02-prod.akamaized.net/bpk-tv/cg_uaap_cplay_sd/default/index.mpd', licenseKey: '95588338ee37423e99358a6d431324b9:6e0f50a12f36599a55073868f814e81e' },
    { id: 'jeepney-tv', name: 'Jeepney TV', logo: 'https://upload.wikimedia.org/wikipedia/en/1/15/Jeepney_TV_Logo_2015.svg', category: 'Pinoy', url: 'https://abslive.akamaized.net/dash/live/2027618/jeepneytv/manifest.mpd', licenseKey: 'dc9fec234a5841bb8d06e92042c741ec:225676f32612dc803cb4d0f950d063d0' },
    { id: 'rock-entertainment', name: 'Rock Entertainment', logo: 'https://i.imgur.com/fx1Y2Eh.png', category: 'Entertainment', url: 'https://qp-pldt-live-bpk-01-prod.akamaized.net/bpk-tv/dr_rockentertainment/default/index.mpd', licenseKey: 'e4ee0cf8ca9746f99af402ca6eed8dc7:be2a096403346bc1d0bb0f812822bb62' },
    { id: 'aniplus', name: 'Aniplus', logo: 'https://i.imgur.com/TXTluER.png', category: 'Kids', url: 'https://amg18481-amg18481c1-amgplt0352.playout.now3.amagi.tv/playlist/amg18481-amg18481c1-amgplt0352/playlist.m3u8' },
    { id: 'zoomoo', name: 'Zoo Moo Asia', logo: 'https://ia803207.us.archive.org/32/items/zoo-moo-kids-2020_202006/ZooMoo-Kids-2020.png', category: 'Kids', url: 'https://zoomoo-samsungau.amagi.tv/playlist.m3u8' },
    { id: 'premier-league', name: 'Premier League', logo: 'https://logos-world.net/wp-content/uploads/2023/02/Premier-League-Logo-2007.png', category: 'Sports', url: 'https://fsly.stream.peacocktv.com/Content/CMAF_CTR-4s/Live/channel(vc1021n07j)/master.mpd', licenseKey: '002046c9a49b9ab1cdb6616bec5d26c3:d2f92f6b7edc9a1a05d393ba0c20ef9e' },
    { id: 'bbc-news', name: 'BBC News', category: 'News', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/BBC_News_2022_(Alt).svg/1200px-BBC_News_2022_(Alt).svg.png', url: 'https://qp-pldt-live-bpk-01-prod.akamaized.net/bpk-tv/bbcworld_news_sd/default/index.mpd', licenseKey: 'f59650be475e4c34a844d4e2062f71f3:119639e849ddee96c4cec2f2b6b09b40' },
    { id: 'iwatch-new-korean-movies', name: 'New Korean Movies', logo: 'https://i.imgur.com/NuGi9x1.jpeg', category: 'Movies', url: 'https://dbrb49pjoymg4.cloudfront.net/manifest/3fec3e5cac39a52b2132f9c66c83dae043dc17d4/prod_default_xumo-ams-aws/0e99c6ec-a912-4cfd-ad60-59c3223ae77d/5.m3u8' },
    { id: 'warner-tv', name: 'Warner TV', logo: 'https://upload.wikimedia.org/wikipedia/commons/5/5e/Warner2018LA.png', category: 'Movies', url: 'https://unifi-live2.secureswiftcontent.com/Content/DASH/Live/channel(WarnerTV)/master.mpd', licenseKey: '6f4ea7be45af4275a8d76845fb19dba5:b02208ea61a2cdbf5b09440bc3157f04' },
    { id: 'spotv', name: 'SPOTV', logo: 'https://ownassetsmysky.blob.core.windows.net/assetsmysky/production/media-upload/1634257286_thumb-spotv.png', category: 'Sports', url: 'https://qp-pldt-live-bpk-01-prod.akamaized.net/bpk-tv/cg_spotvhd/default/index.mpd', licenseKey: 'ec7ee27d83764e4b845c48cca31c8eef:9c0e4191203fccb0fde34ee29999129e' },
    { id: 'spotv2', name: 'SPOTV 2', logo: 'https://ownassetsmysky.blob.core.windows.net/assetsmysky/production/media-upload/1634257305_thumb-spotv-2.png', category: 'Sports', url: 'https://qp-pldt-live-bpk-01-prod.akamaized.net/bpk-tv/cg_spotv2hd/default/index.mpd', licenseKey: '7eea72d6075245a99ee3255603d58853:6848ef60575579bf4d415db1032153ed' },
    { id: 'rock-action', name: 'Rock Action', logo: 'https://uploads-ssl.webflow.com/64e961c3862892bff815289d/64f57100366fe5c8cb6088a7_logo_ext_web.png', category: 'Entertainment', url: 'https://qp-pldt-live-bpk-01-prod.akamaized.net/bpk-tv/dr_rockextreme/default/index.mpd', licenseKey: '0f852fb8412b11edb8780242ac120002:4cbc004d8c444f9f996db42059ce8178' },
    { id: 'cna', name: 'Channel News Asia', logo: 'https://logowik.com/content/uploads/images/cna-channel-news-asia9392.jpg', category: 'News', url: 'https://tglmp03.akamaized.net/out/v1/43856347987b4da3890360b0d18b5dc5/manifest.mpd', licenseKey: '4ee336861eed4840a555788dc54aea6e:f1f53644d4941d4ed31b4bb2478f8cf4' },
    { id: 'kapatid-channel', name: 'Kapatid Channel', category: 'Entertainment', logo: 'https://liveplay.vercel.app/assets/kapatid_channel_logo.png', url: 'https://qp-pldt-live-bpk-02-prod.akamaized.net/bpk-tv/pphd_sdi1/default/index.mpd', licenseKey: 'dbf670bed2ea4905a114557e90e7ffb6:616059bec8dfb27f3524b7e7c31b6cff' },
    { id: 'wiltv', name: 'Wil TV', category: 'Entertainment', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/WILTV_logo.svg/500px-WILTV_logo.svg.png', url: 'https://qp-pldt-live-bpk-02-prod.akamaized.net/bpk-tv/wiltv/default/index.mpd', licenseKey: 'b1773d6f982242cdb0f694546a3db26f:ae9a90dbea78f564eb98fe817909ec9a' },
    { id: 'crave-1', name: 'Crave', category: 'Movies', logo: 'https://www.start.ca/wp-content/uploads/2022/09/StartTV_ChannelLogos_Crave1.png', url: 'https://live-crave.video.9c9media.com/137c6e2e72e1bf67b82614c7c9b216d6f3a8c8281748505659713/fe/f/crave/crave1/manifest.mpd', licenseKey: '4a107945066f45a9af2c32ea88be60f4:df97e849d68479ec16e395feda7627d0' },
    { id: 'crave-2', name: 'Crave 2', category: 'Movies', logo: 'https://www.start.ca/wp-content/uploads/2022/09/StartTV_ChannelLogos_Crave2.png', url: 'https://live-crave.video.9c9media.com/ab4332c60e19b6629129eeb38a2a6ac6db5df2571721750022187/fe/f/crave/crave2/manifest.mpd', licenseKey: '4ac6eaaf0e5e4f94987cbb5b243b54e8:8bb3f2f421f6afd025fa46c784944ad6' },
    { id: 'crave-3', name: 'Crave 3', category: 'Movies', logo: 'https://www.start.ca/wp-content/uploads/2022/09/StartTV_ChannelLogos_Crave3.png', url: 'https://live-crave.video.9c9media.com/58def7d65f59ffaf995238981dd0e276d5a8fe8d1748593014588/fe/f/crave/crave3/manifest.mpd', licenseKey: 'eac7cd7979f04288bc335fc1d88fa344:0fca71cf91b3c4931ad3cf66c631c24c' },
    { id: 'crave-4', name: 'Crave 4', category: 'Movies', logo: 'https://www.start.ca/wp-content/uploads/2022/09/StartTV_ChannelLogos_Crave4.png', url: 'https://live-crave.video.9c9media.com/c5875a31f178e038f7cc572b1aa0defb996ce7171748593186018/fe/f/crave/crave4/manifest.mpd', licenseKey: 'a7242a7026ff45609114ee1f3beb34dc:65c32ada65548203a3683d5d37dd3a06' },
    { id: 'bein-sports1', name: 'BeIN Sports 1', category: 'Sports', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/Logo_bein_sports_1.png/1200px-Logo_bein_sports_1.png', url: 'https://aba5sdmaaaaaaaamdwujas5g6mg4r.otte.live.cf.ww.aiv-cdn.net/syd-nitro/live/clients/dash/enc/ghwcl6hv68/out/v1/83536910d8034e9b9895a20fbe1c1687/cenc.mpd', licenseKey: '335dad778109954503dcbb21dc92015f:24bfd75d436cbf73168a2a2dccd40281' },
    { id: 'bein-sports2', name: 'BeIN Sports 2', category: 'Sports', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c9/Logo_bein_sports_2.png/1200px-Logo_bein_sports_2.png', url: 'https://aba5sdmaaaaaaaamdwujas5g6mg4r.otte.live.cf.ww.aiv-cdn.net/syd-nitro/live/clients/dash/enc/8m8cd46i1t/out/v1/83985c68e4174e90a58a1f2c024be4c9/cenc.mpd', licenseKey: '0b42be2664d7e811d04f3e504e0924c5:ae24090123b8c72ac5404dc152847cb8' },
    { id: 'bein-sports3', name: 'BeIN Sports 3', category: 'Sports', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c4/Logo_bein_sports_3.png/1200px-Logo_bein_sports_3.png', url: 'https://aba5sdmaaaaaaaamhq2w5oosrf5ae.otte.live.cf.ww.aiv-cdn.net/syd-nitro/live/dash/enc/q4u5nwaogz/out/v1/18de6d3e65934f3a8de4358e69eab86c/cenc.mpd', licenseKey: '7995c724a13748ed970840a8ab5bb9b3:67bdaf1e2175b9ff682fcdf0e2354b1e' },
    { id: 'eurosport-1', name: 'Eurosport 1', category: 'Sports', logo: 'https://liveplay.vercel.app/assets/eurosport1_logo.svg', url: 'https://v4-pan-n79-cdn-01.live.cdn.cgates.lt/live/dash/561802/index.mpd', licenseKey: '01a665d487aa4c1c898c9eb0ff1a21df:a0b9df5f92e6b218ddb6aa40a2cd996d' },
    { id: 'eurosport-2', name: 'Eurosport 2', category: 'Sports', logo: 'https://liveplay.vercel.app/assets/eurosport2_logo.svg', url: 'https://v4-pan-n79-cdn-01.live.cdn.cgates.lt/live/dash/561705/index.mpd', licenseKey: '657707bbd1e240e08bd6969df27fef7c:364e00581c1432f4175e4a2e8e0cd57e' },
    { id: 'nfl-network', name: 'NFL Network', category: 'Sports', logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/a/a2/National_Football_League_logo.svg/873px-National_Football_League_logo.svg.png', url: 'https://ac-009.live.p7s1video.net/e0e064c8/t_004/ran-nflnetwork-de-hd/cenc-default.mpd', licenseKey: 'b26a662a10074eb0756404c8e90e765a:76e376bd25f92bed939435d982f92d3f' },
    { id: 'fifa', name: 'Fifa', category: 'Sports', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/FIFA%2B_%282025%29.svg/2560px-FIFA%2B_%282025%29.svg.png', url: 'https://ca333c39.wurl.com/v1/sysdata_s_p_a_fifa_6/ohlscdn_us/V00000000/0/HLS/playlist_3000k_20251020T100738.m3u8' },
    { id: 'bbc-cbeebies', name: 'BBC CBeebies', category: 'Kids', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f2/CBeebies_logo_with_outline.svg/1200px-CBeebies_logo_with_outline.svg.png', url: 'https://viamotionhsi.netplus.ch/live/eds/bbc4cbeebies/browser-dash/bbc4cbeebies.mpd' },
    { id: 'myx', name: 'MYX', category: 'Music', logo: 'https://assets-myxglobal.abs-cbn.com/wp-content/uploads/2022/07/MYX_New_Logo_Web1.png', url: 'https://d24xfhmhdb6r0q.cloudfront.net/out/v1/e897a7b6414a46019818ee9f2c081c4f/index.mpd' },
    { id: 'vevopop', name: 'Vevopop', category: 'Music', logo: 'https://liveplay.vercel.app/assets/vevopop_logo.svg', url: 'https://amg00056-amg00056c6-rakuten-uk-3235.playouts.now.amagi.tv/1080p/index.m3u8' },
    { id: 'mtv-live-us', name: 'MTV Live US', category: 'Music', logo: 'https://static.wikia.nocookie.net/logopedia/images/5/58/MTV_Live_%28orange%29.svg', url: 'https://fl1.moveonjoy.com/MTV_LIVE/manifest.mpd' },
    { id: 'kix', name: 'KIX', category: 'Sports', logo: 'https://upload.wikimedia.org/wikipedia/commons/0/0b/KIX_logo.svg', url: 'https://qp-pldt-live-bpk-01-prod.akamaized.net/bpk-tv/kix_hd1/default/index.mpd', licenseKey: 'a8d5712967cd495ca80fdc425bc61d6b:f248c29525ed4c40cc39baeee9634735' },
    { id: 'animal-planet-hd-in', name: 'Animal Planet HD (IN)', category: 'Documentary', logo: 'https://wildaid.org/wp-content/uploads/2021/08/animal-planet-logo-white.png', url: 'https://d1g8wgjurz8via.cloudfront.net/bpk-tv/Animalplanethd2/default/index.mpd', licenseKey: 'df81f15150f74c799fdde64ef49dfb75:05794a012ae74d77953f2b9fae6804c7' },
    { id: 'love-nature', name: 'Love Nature', category: 'Documentary', logo: 'https://blueantmedia.com/wp-content/uploads/2025/02/LoveNature2024_Logo_Coral-768x304.png', url: 'https://ottb.live.cf.ww.aiv-cdn.net/dub-nitro/live/dash/enc/utcsjvt6qk/out/v1/8ee87ae683ec4b458720621cb2244937/cenc.mpd', licenseKey: 'cec4c3c055a7f7e496cbe3abe06ae7c3:6b96bdc30b53ae19d40b4e17c66e5afd' },
    { id: 'pbb-all-access', name: 'PBB All Access', category: 'Entertainment', logo: 'https://static.wikia.nocookie.net/bigbrother/images/d/dc/PBBCOLLAB2_EYE.png', url: 'https://cdn-uw2-prod.tsv2.amagi.tv/linear/amg01006-abs-cbn-pbb-live-dash-abscbnono/index.mpd' },
    { id: 'pbb-catch-up-livestream', name: 'PBB Catch-Up Livestream', category: 'Entertainment', logo: 'https://static.wikia.nocookie.net/bigbrother/images/d/dc/PBBCOLLAB2_EYE.png', url: 'https://abslive.akamaized.net/dash/live/2032648/event2/manifest.mpd', licenseKey: 'b93c215d3a8042f883acff6444c9f087:056b82112064371cae8c047fe65e9a26' },
    { id: 'yourface-sounds-familiar-catch-up-livestream', name: 'Yourface Sounds Familiar Catch-Up Livestream', category: 'Entertainment', logo: 'https://pql-static.abs-cbn.com/images/master/YFSF_LIVETITLETREATMENT_2025_V1_png_20251003100022.png', url: 'https://abslive.akamaized.net/dash/live/2027618/event4-3/manifest.mpd', licenseKey: '3b38b047c273424dbe1b9c64468f9bbb:40703c379a41bf95eb84d620fd718bd4' },
    { id: 'sea-games-ph-total-sports', name: 'Sea Games PH Total Sports', category: 'Sports', logo: 'https://pilipinaslive.com/assets/images/logo/pilipinaslive-logo.svg', url: 'https://qp-pldt-live-bpk-02-prod.akamaized.net/bpk-tv/pp_ch2_pri/default/index.mpd', licenseKey: '4fef00332d7e4fbc8f7005dfbf851a59:a6368c181358f3e527411a6c452c6a1a' },
    { id: 'iwatch-universal-movies', name: 'Universal Movies', logo: 'https://i.imgur.com/0rq9qX4.png', category: 'Movies', url: 'https://d4whmvwm0rdvi.cloudfront.net/10007/99991621/hls/master.m3u8' },
    { id: 'iwatch-dove-channel', name: 'Dove Channel', logo: 'https://i.ibb.co/t3dXphQ/download-2024-06-27-T073317-555.png', category: 'Entertainment', url: 'https://linear-896.frequency.stream/dist/xumo/896/hls/master/playlist_1280x720.m3u8' },
    { id: 'iwatch-ragetv', name: 'Rage TV', logo: 'https://i.imgur.com/E3q2kTu.png', category: 'Entertainment', url: 'https://live20.bozztv.com/giatv/giatv-ragetv/ragetv/chunks.m3u8' },
    { id: 'iwatch-comicu', name: 'Comic U', logo: 'https://i.imgur.com/ziTlvlL.jpeg', category: 'Entertainment', url: 'https://amg19223-amg19223c8-amgplt0351.playout.now3.amagi.tv/playlist/amg19223-amg19223c8-amgplt0351/playlist.m3u8' },
    { id: 'iwatch-bilyonaryo', name: 'Bilyonaryo', logo: 'https://i.imgur.com/W00t4Qn.png', category: 'News', url: 'https://amg19223-amg19223c11-amgplt0352.playout.now3.amagi.tv/ts-eu-w1-n2/playlist/amg19223-amg19223c11-amgplt0352/playlist.m3u8' },
    { id: 'iwatch-red-box-movies', name: 'Red Box Movies', logo: 'https://i.imgur.com/OrGCnPg.jpg', category: 'Movies', url: 'https://7732c5436342497882363a8cd14ceff4.mediatailor.us-east-1.amazonaws.com/v1/master/04fd913bb278d8775298c26fdca9d9841f37601f/Plex_NewMovies/playlist.m3u8' },
    { id: 'iwatch-dubai-one', name: 'Dubai One', logo: 'https://i.ibb.co/rvWwhkx/download-31.png', category: 'Entertainment', url: 'https://dminnvllta.cdn.mgmlcdn.com/dubaione/smil:dubaione.stream.smil/chunklist_b1300000.m3u8' },
    { id: 'iwatch-asian-crush', name: 'Asian Crush', logo: 'https://i.imgur.com/fUg91vw.jpeg', category: 'Movies', url: 'https://cineverse.g-mana.live/media/1ebfbe30-c35c-4404-8bc5-0339d750eb58/mainManifest.m3u8' },
    { id: 'tsn-1', name: 'TSN 1', category: 'Sports', logo: 'https://bellmedia-images.stats.bellmedia.ca/images/sports/channel-logos/tsn1-light.webp', url: 'https://ca333c39.wurl.com/v1/sysdata_s_p_a_fifa_6/ohlscdn_us/V00000000/0/HLS/playlist_3000k_20251020T100738.m3u8', licenseKey: '7e99f734748d098cbfa2f7bde968dd44:98ea6088c3222e9abaf61e537804d6cc' },
    { id: 'tsn-2', name: 'TSN 2', category: 'Sports', logo: 'https://bellmedia-images.stats.bellmedia.ca/images/sports/channel-logos/tsn2-light.webp', url: 'https://ottb.live.cf.ww.aiv-cdn.net/lhr-nitro/live/clients/dash/enc/v5v9yfn62i/out/v1/0991e33d09da46b2857fcc845db95c40/cenc.mpd', licenseKey: '362202eefc5d9e42eec6450998cce9e8:978dfdd53186ec587d940e0bd1e2ec42' },
    { id: 'tsn-3', name: 'TSN 3', category: 'Sports', logo: 'https://bellmedia-images.stats.bellmedia.ca/images/sports/channel-logos/tsn3-light.webp', url: 'https://ottb.live.cf.ww.aiv-cdn.net/lhr-nitro/live/clients/dash/enc/mrskysvotx/out/v1/ad58961bd8fd48d2944e461c034b8914/cenc.mpd', licenseKey: 'd9097a1b7d04b7786b29f2b0e155316d:279695ebe0fb1bc5787422b6b59ce8a8' },
    { id: 'tsn-4', name: 'TSN 4', category: 'Sports', logo: 'https://bellmedia-images.stats.bellmedia.ca/images/sports/channel-logos/tsn4-light.webp', url: 'https://ottb.live.cf.ww.aiv-cdn.net/lhr-nitro/live/clients/dash/enc/irtfdsri14/out/v1/165128c314e944faa3d79e107974b323/cenc.mpd', licenseKey: 'e1aa4c4daf6222a04f7ae80130495ea1:31bb1ee9a8d088f62b0103550c301449' },
    { id: 'tsn-5', name: 'TSN 5', category: 'Sports', logo: 'https://bellmedia-images.stats.bellmedia.ca/images/sports/channel-logos/tsn5-light.webp', url: 'https://ottb.live.cf.ww.aiv-cdn.net/lhr-nitro/live/clients/dash/enc/mttgh1c4ei/out/v1/9cc664b146744e2ba23066aa048efbc5/cenc.mpd', licenseKey: '8ce20e2a4b3dd04e0a6e5469b7cb47be:163c323b65d0597b13f037641fd67b1e' },
    { id: 'national-geographic', name: 'National Geographic', category: 'Documentary', logo: '/channels/national_geographic.png', url: 'https://fl31.moveonjoy.com/National_Geographic/index.m3u8' },
    { id: 'nat-geo-wild', name: 'National Geographic Wild', category: 'Documentary', logo: '/channels/national_geo_wild.png', url: 'https://fl1.moveonjoy.com/Nat_Geo_Wild/index.m3u8' },
    { id: 'wild-nature', name: 'Wild Nature', category: 'Outdoors', logo: 'https://a.jsrdn.com/hls/23208/wild-nature/logo_20250401_214215_70.png', url: 'https://dg5rg8emlfy55.cloudfront.net/v1/master/9d062541f2ff39b5c0f48b743c6411d25f62fc25/DistroTV-MuxIP-WildNature2/491.m3u8' },
    { id: 'euronews', name: 'Euronews (EN)', category: 'News', logo: 'https://a.jsrdn.com/hls/22886/euronews/logo_20231218_175557_70.png', url: 'https://d35j504z0x2vu2.cloudfront.net/v1/manifest/0bc8e8376bd8417a1b6761138aa41c26c7309312/euronews/316027a1-87ae-45ad-9535-9f3d05ad2c0b/5.m3u8' },
    { id: 'unleashed-dogtv', name: 'Unleashed by DOGTV', category: 'Reality', logo: 'https://a.jsrdn.com/hls/23231/unleashed-by-dogtv/logo_20251030_220003_68.png', url: 'https://amg26269-amg26269c2-distrotv-us-8939.playouts.now.amagi.tv/ts-us-e2-n1/playlist/amg26269-dogtv-unleashedbydogtv-distrotvus/cb543d1e786c648e9dd43765cef043a2f9591fde1d6988693eb5518975d1073edce2a59caa08ff16388f1ede7f0a66413a3e951fda77118fd87eb141453c5728cfffe729a2c05616b7db083429b56a062a866a68ac39437ed0e21f48a238b6720a5aa82a66443d80b846ac7251db80148b61299bce8c37683f03409a5e5afba358b1ebe85e468b6af7b94a55c07d4de39f43c8821ca6d1860dcb5ed270f710cc9bf88b821985849b729368e3301a16236d89bf6f96db4ebfd5941b57f61d7a164c04b6f6c2ad1f6cd2161927928ecabb76b116de80368e643289018c468a37f80dc06d93d70387f7f3b532403db78a5e712eb3eaa48fef3c27b16389d683af467295f3156b4fcc6998203278b4d2ec20b29946fcdf2281a7271836d6ae4ce9dbd8c7b6e6d51a9e239297b9c93b14192e5051d20bef9b358c71907bfa9b1220591e1dfe9c0796dca23442634b95ce5ad10512badea882cb0b3cc57202288d0aba4c006e964c0612e429ead42f789b230b882124eb5d47e62898b425e3a2819f6c55b4dad40cfa7fe6a605d6f33da0694e3168d5a3780c131a2e8a9c0c66317dd00be3d6c5d56e19059e94a79f9209476d4116561fc5e6e266928dc50a1218cf5625747d1f19a21dc66cad6323617c936db9c6087096482928efa037492809fcabe0d9d78c852edb7ed7dcb33a20354d66b327103462a1cbe722f52c5f6e6907cf407354aa495e4bf981dbead7947881906dbc3d2d4e15af9816451a1c7d62079ee202bd36c69a0ead89c568fab5f978228438b04f1c9fc4ae05928ad8891657c9f8074310fdbd26c16063c312c2228bd75dd9bb50747956237fc78c0e8b35d4de9ed4659e29bb46007bce568fee80d9b7360c90fb2232371a1b1b705c715e67d2b384365235b4ec7fbe0dbc9e3fc24350207154d68d17618fec057af6512b33f2f491cac7a70214d920f779c0650db268043e93bc5284d2e2a0b4d63f034e81e5e51de8f3d2eea6b1cb226d456b3594b33b3f15e80eaae36d89ac196fa18e8ff5c81cf41f8365e1fbdc5ae538b385bf01a08498f0ef48134b4856e8c8f8f466bcd66f14e32b8b1d7760f6e4e5f076b5c9b4086fd85cf48c0969dc581439fd9db6239269d289382ef4c96849c55733d5e5f8290ed156c84a5f78ffd9847c2fceca019e489581ad4a26e1091af7094d69a36bee8eab656a93c8797264e307028d648ccddd1c5b6beeb649021e3b566763b841583faa2963a10eba9687db0b73dc51d07255cd78abd119b4aa03f9d0c5e7abe23777aef21f649565822298019f8fd58952c35265b926831466d4b9b69ad9fbd2b3958c7433199257d50ecd7888c3dbd71f422f74ca0a295e29f513ce0e0747d8e85ccca25e789fd2f84ff30340564e313ec815b78f1d123449e3e7798e936371656526edb165dd72e51fe2e53d1bbc1e7c5c14024b56ad85c908ac30b660b5fb5e40f584a5a728f3e03bd19bc6e7be5f01c1576a4a479ef78d94d84023f59b98dd316786ab71ba007c3a38cedead407bd5c0282ff6a79e67f7b86c805826056bd18dbd26de33863ded1f4cce34c3f6487e819d19207b863e84ca3f51a349a60a058517e02631d113791649228a31c66801292de279d58ccc362501974bd95a6738aed2f990a35f35777d0450743a29419c2a53d1093a0ba11730bac5e8add5858e0b292ce542bfcc83844a4af8f0d790845ff44b8a979bccb09adbc24a7d39d7495cc016a0091e8c8613d2778585d69d2b04ba8a38c71f1b349845582196e6490e082d01adeb89229548a916b7b5eee2c87dd2cdf861555c97ace421a51fed4e412a63cf7690cc2c2be0b89e6d8464289cd286e1a5a9269683f04dccea374eb294c25ac4a9dc74a43c7125754844588905c942eefe1a80252fb54d662bff23c2346735e0a4d824afba15757a0d6fb436a74b45910dff625d4064c88c14ddadaea3bb3968302fb7964b8a410ca5350042b9bb945134d434f20088eb9593056b1e2e77a3604e7a6fc37768414cbb9e50234a19d77985595ffde0b9940a527fc6cf4dced52e28e9f9ce20e871fb04892aab67195d0689577c36f6727c577028181e072742dffb078dc5e38f22b6a9c6a765f1ac1a91cc662a9bb42e96b01dcb1f61a71d7c8a999d2585225cf6f78cf5220c6ad36f0ba0dd84d60d099a996200db4707d7f9529a56704de9f62e90e2b37957e03ceb7842c3cdc29c36492032c0815ab9a377c5503122705ef98f41d4c721fb928bbafe9c32d9874d5747c23994d862b28dbc0601aec43282e7b56f07a0c078d4749d702aa805bb4d3a866263db273640af6de12bf58ae224b9f30b992f2cf9de771a9836693bc7cfad2ca8107e6a77bd5f6c66482036f5bc1efad2e1f0736148255630365e3a0553c2492fc0f8e255ca7492aa462cf82f3dc85b9e/28/1920x1080_5859480/index.m3u8' },
    { id: 'pll-network', name: 'PLL Network', category: 'Sports', logo: 'https://a.jsrdn.com/hls/22964/pll-network-ww/logo_20240626_232614_70.png', url: 'https://d35j504z0x2vu2.cloudfront.net/v1/master/0bc8e8376bd8417a1b6761138aa41c26c7309312/pll-network-ww/pll.m3u8' },
    { id: 'mtrspt1', name: 'MTRSPT1', category: 'Sports', logo: 'https://a.jsrdn.com/hls/23099/mtrspt1/logo_20250122_232635_70.png', url: 'https://amg02873-kravemedia-mtrspt1-distrotv-mnsrl.amagi.tv/ts-us-w2-n1/playlist/amg02873-kravemedia-mtrspt1-distrotv/playlist.m3u8' },
    { id: 'motorracing', name: 'Motor Racing', category: 'Sports', logo: 'https://a.jsrdn.com/hls/22705/motorracing/logo_20231219_215946_68.png', url: 'https://d35j504z0x2vu2.cloudfront.net/v1/manifest/0bc8e8376bd8417a1b6761138aa41c26c7309312/motorracing/301877df-89fb-4935-b20d-c03e7e242eab/2.m3u8' },
    { id: 'wfnnetwork', name: 'WFN: World Fishing Network', category: 'Outdoors', logo: 'https://a.jsrdn.com/hls/23208/wfn-world-fishing-network/logo_20250911_182344_70.png', url: 'https://d3b3ldcvgsu291.cloudfront.net/v1/master/9d062541f2ff39b5c0f48b743c6411d25f62fc25/DistroTV-MuxIP-WFN/477.m3u8' },
    { id: 'horizonsports', name: 'Horizon Sports', category: 'Sports', logo: 'https://a.jsrdn.com/hls/22705/horizon-sports/logo_20231219_213910_70.png', url: 'https://d35j504z0x2vu2.cloudfront.net/v1/master/0bc8e8376bd8417a1b6761138aa41c26c7309312/horizon-sports/master.m3u8' },
    { id: 'daystartv', name: 'Daystar TV', category: 'Spirituality', logo: 'https://a.jsrdn.com/hls/23240/daystar-tv/logo_20251209_232020_69.png', url: 'https://hls-live-media-gc.cdn01.net/mpegts/232076_2222904/HMX0lSsFdwYe2y3CWVtL3A/1771632000/master_mpegts.m3u8' },
    { id: 'elevationchurchnetwork', name: 'Elevation Church Network', category: 'Spirituality', logo: 'https://a.jsrdn.com/hls/23224/elevation-church-network/logo_20250623_165558_70.png', url: 'https://d35j504z0x2vu2.cloudfront.net/v1/master/0bc8e8376bd8417a1b6761138aa41c26c7309312/elevation-church-network/playlist.m3u8' },
    { id: 'kidstv', name: 'Kids TV', category: 'Kids', logo: 'https://a.jsrdn.com/hls/23088/kids-tv/logo_20231219_214656_61.png', url: 'https://d35j504z0x2vu2.cloudfront.net/v1/master/0bc8e8376bd8417a1b6761138aa41c26c7309312/kids-tv/master_en.m3u8' },
    { id: 'toonzkids', name: 'Toonz Kids', category: 'Kids', logo: 'https://a.jsrdn.com/hls/23131/toonzkids/logo_20231219_223312_67.png', url: 'https://d35j504z0x2vu2.cloudfront.net/v1/master/0bc8e8376bd8417a1b6761138aa41c26c7309312/toonzkids/master.m3u8' },
    {
        id: 'gusto-tv', name: 'Gusto TV', category: 'Reality', logo: 'https://a.jsrdn.com/hls/23062/gusto-tv/logo_20231219_202519_56.png', url: 'https://d35j504z0x2vu2.cloudfront.net/v1/master/0bc8e8376bd8417a1b6761138aa41c26c7309312/gusto-tv/playlist.m3u8'
    },
    {
        id: 'kaloopy', name: 'Kaloopy', category: 'Entertainment', logo: 'https://a.jsrdn.com/hls/22868/kaloopy/logo_20231219_214555_68.png', url: 'https://d35j504z0x2vu2.cloudfront.net/v1/master/0bc8e8376bd8417a1b6761138aa41c26c7309312/kaloopy/master.m3u8'
    },
    {
        id: 'wild-tv', name: 'Wild TV', category: 'Outdoors', logo: 'https://a.jsrdn.com/hls/23208/wild-tv/logo_20250401_215043_70.png', url: 'https://d1tm3cz23db55z.cloudfront.net/v1/master/9d062541f2ff39b5c0f48b743c6411d25f62fc25/DistroTV-MuxIP-WildTV/476.m3u8'
    },
    {
        id: 'true-history', name: 'True History', category: 'Documentary', logo: 'https://a.jsrdn.com/hls/23001/true-history/logo_20231219_223655_68.png', url: 'https://d35j504z0x2vu2.cloudfront.net/v1/master/0bc8e8376bd8417a1b6761138aa41c26c7309312/true-history/playlist.m3u8'
    }
];

/**
 * IPTVWatch - Fully isolated IPTV player component
 * Fullscreen UI matching Watch.jsx pattern
 * Does NOT share any code with Watch.jsx (API-based player)
 */
const IPTVWatch = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { channelId } = useParams();

    const videoRef = useRef(null);
    const playerRef = useRef(null);
    const containerRef = useRef(null);

    const [channel, setChannel] = useState(location.state?.channel || null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);
    const [playerLoaded, setPlayerLoaded] = useState(false);
    const [controlsVisible, setControlsVisible] = useState(true);
    const [isFullscreen, setIsFullscreen] = useState(false);

    // Channel strip state
    const [channels, setChannels] = useState(location.state?.channels || []);
    const [currentIndex, setCurrentIndex] = useState(location.state?.channelIndex || 0);
    const [showChannelStrip, setShowChannelStrip] = useState(false);
    const [focusedIndex, setFocusedIndex] = useState(0); // Track focused item in strip
    const channelStripTimer = useRef(null);
    const channelRefs = useRef([]);

    const hideControlsTimer = useRef(null);
    const keyRef = useRef(null);
    const [latestKey, setLatestKey] = useState(null);

    // Fetch channel data if not provided via navigation state (direct URL load)
    useEffect(() => {
        if (channel) return; // Already have channel from navigation state

        const fetchChannelById = async () => {
            try {
                // First check manual channels
                const manualChannels = getManualChannels();
                const numericId = parseInt(channelId, 10);
                let foundChannel = manualChannels.find(c =>
                    c.id === channelId || c.id === numericId
                );

                if (foundChannel) {
                    setChannel(foundChannel);
                    const allChannels = [...manualChannels];
                    setChannels(allChannels);
                    const idx = allChannels.findIndex(c => c.id === foundChannel.id);
                    setCurrentIndex(idx >= 0 ? idx : 0);
                    return;
                }

                // Fetch M3U playlist and parse
                const response = await fetch(M3U_URL);
                if (!response.ok) throw new Error('Failed to fetch playlist');
                const text = await response.text();
                const parsed = parseM3U(text);

                // Combine with manual channels (filter out excluded IDs: 5, 6, 78)
                const excludedIds = [5, 6, 78];
                const filteredParsed = parsed.filter(ch => !excludedIds.includes(ch.id));
                const allChannels = [...manualChannels, ...filteredParsed];

                // Find channel by ID (could be numeric or string)
                foundChannel = allChannels.find(c =>
                    c.id === channelId || c.id === numericId
                );

                if (foundChannel) {
                    setChannel(foundChannel);
                    setChannels(allChannels);
                    const idx = allChannels.findIndex(c => c.id === foundChannel.id);
                    setCurrentIndex(idx >= 0 ? idx : 0);
                } else {
                    setError(`Channel with ID "${channelId}" not found`);
                }
            } catch (err) {
                console.error('Error fetching channel:', err);
                setError(`Failed to load channel: ${err.message}`);
            }
        };

        fetchChannelById();
    }, [channelId, channel]);

    // Reset controls hide timer
    const resetHideTimer = () => {
        setControlsVisible(true);
        if (hideControlsTimer.current) {
            clearTimeout(hideControlsTimer.current);
        }
        hideControlsTimer.current = setTimeout(() => {
            if (playerLoaded) {
                setControlsVisible(false);
            }
        }, 3000);
    };

    // Auto-hide timer for channel strip
    const resetChannelStripTimer = useCallback(() => {
        if (channelStripTimer.current) clearTimeout(channelStripTimer.current);
        channelStripTimer.current = setTimeout(() => {
            setShowChannelStrip(false);
        }, 5000); // 5 seconds timeout for channel strip
    }, []);

    // Toggle channel strip
    const toggleChannelStrip = useCallback(() => {
        setShowChannelStrip(prev => {
            const newState = !prev;
            if (newState) {
                resetChannelStripTimer();
                setFocusedIndex(currentIndex); // Start focus on current channel
                setTimeout(() => {
                    channelRefs.current[currentIndex]?.focus();
                    channelRefs.current[currentIndex]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                }, 100);
            }
            return newState;
        });
    }, [currentIndex, resetChannelStripTimer]);

    // Switch channel without remounting page
    const switchChannel = useCallback((newChannel, newIndex) => {
        if (newChannel.id === channel?.id) return;
        setChannel(newChannel);
        setCurrentIndex(newIndex);
        setError(null);
        setLoading(true);
        setShowChannelStrip(false);
        // Update URL without adding to history
        navigate(`/iptv/watch/${newChannel.id}`, { replace: true, state: { channel: newChannel, channels, channelIndex: newIndex } });
    }, [channel, channels, navigate]);

    // Navigate prev/next channel
    const navigateChannel = useCallback((direction) => {
        if (channels.length === 0) return;
        const newIndex = (currentIndex + direction + channels.length) % channels.length;
        switchChannel(channels[newIndex], newIndex);
    }, [currentIndex, channels, switchChannel]);

    // Keyboard/D-pad navigation (Android TV support)
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (showChannelStrip && channels.length > 0) {
                // Strip is open - custom focus navigation
                if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    setShowChannelStrip(false);
                } else if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    const nextIndex = (focusedIndex + 1) % channels.length;
                    setFocusedIndex(nextIndex);
                    channelRefs.current[nextIndex]?.focus();
                    channelRefs.current[nextIndex]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                    resetChannelStripTimer();
                } else if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    const prevIndex = (focusedIndex - 1 + channels.length) % channels.length;
                    setFocusedIndex(prevIndex);
                    channelRefs.current[prevIndex]?.focus();
                    channelRefs.current[prevIndex]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                    resetChannelStripTimer();
                }
            } else {
                // Strip is closed - quick zap mode
                if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    toggleChannelStrip();
                } else if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    navigateChannel(-1);
                } else if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    navigateChannel(1);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showChannelStrip, channels, focusedIndex, toggleChannelStrip, navigateChannel, resetChannelStripTimer]);

    // 1. Key Harvester Listener - receives keys from the extension's hook.js via postMessage
    useEffect(() => {
        const handleMessage = (event) => {
            if (event.data && event.data.type === 'MAPPLE_KEY_CAPTURED') {
                console.log('[IPTVWatch] RECEIVED KEY FROM IFRAME:', event.data.key);
                keyRef.current = event.data.key;
                setLatestKey(event.data.key);
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    // Handle fullscreen changes
    useEffect(() => {
        const handleFullscreenChange = () => {
            const isFs = !!(document.fullscreenElement ||
                document.webkitFullscreenElement ||
                document.mozFullScreenElement ||
                document.msFullscreenElement);
            setIsFullscreen(isFs);
            if (isFs) {
                resetHideTimer();
            } else {
                setControlsVisible(true);
                if (hideControlsTimer.current) {
                    clearTimeout(hideControlsTimer.current);
                }
            }
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
            document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
            if (hideControlsTimer.current) {
                clearTimeout(hideControlsTimer.current);
            }
        };
    }, [playerLoaded]);

    // Initialize Shaka Player
    useEffect(() => {
        shaka.polyfill.installAll();

        if (!shaka.Player.isBrowserSupported()) {
            setError('Your browser does not support video playback');
            setLoading(false);
            return;
        }

        return () => {
            if (playerRef.current) {
                playerRef.current.destroy();
                playerRef.current = null;
            }
        };
    }, []);

    // Load stream when player is activated
    useEffect(() => {
        if (!playerLoaded || !videoRef.current || !channel) return;

        // Use channel from state
        const isMappleChannel = channel.mappleId;
        const streamUrl = channel.url;

        const initPlayer = async () => {
            try {
                setLoading(true);

                if (playerRef.current) {
                    await playerRef.current.destroy();
                }

                // FIX: Check for stale Jeepney TV key and update if necessary
                if (channel.id === 'jeepney-tv') {
                    // Correct Key from liveplay.vercel.app
                    const freshKey = 'dc9fec234a5841bb8d06e92042c741ec:225676f32612dc803cb4d0f950d063d0';
                    if (channel.licenseKey !== freshKey) {
                        console.warn('[IPTVWatch] Detected stale Jeepney TV key. Force-updating to fresh key.');
                        channel.licenseKey = freshKey;
                    }
                }

                // Install polyfills
                shaka.polyfill.installAll();

                // Check browser support
                if (!shaka.Player.isBrowserSupported()) {
                    throw new Error('Browser does not support Shaka Player');
                }

                // Create detached player
                const player = new shaka.Player();
                await player.attach(videoRef.current);
                playerRef.current = player;

                // OFFLINE KEY INTERCEPTOR - For Mapple channels, intercept key requests
                if (isMappleChannel) {
                    player.getNetworkingEngine().registerRequestFilter((type, request) => {
                        // Intercept KEY requests
                        if (type === shaka.net.NetworkingEngine.RequestType.KEY) {
                            // Check if this is the key from kiko2.ru
                            if (request.uris[0].includes('chevy.kiko2.ru') ||
                                request.uris[0].includes('ddy6new.kiko2.ru') ||
                                request.uris[0].includes('nfsnew.kiko2.ru')) {
                                console.log('[IPTVWatch] Intercepting Key Request:', request.uris[0]);
                                // Rewrite to custom scheme to handle it locally
                                request.uris[0] = 'offline:mapple_key';
                            }
                        }
                    });

                    // Register 'offline' scheme to serve the harvested key
                    shaka.net.NetworkingEngine.registerScheme('offline', (uri, request) => {
                        if (uri === 'offline:mapple_key') {
                            // Implement polling wait for key (max 15s)
                            return new Promise((resolve, reject) => {
                                let attempts = 0;
                                const maxAttempts = 150; // 15 seconds
                                const interval = setInterval(() => {
                                    attempts++;
                                    const key = localStorage.getItem('replay_key');
                                    if (key) {
                                        clearInterval(interval);
                                        // Key found! Convert hex string to buffer
                                        // The key from replay_key is usually hex string
                                        // Check if key is raw bytes or hex
                                        // Usually for Mapple it's binary content
                                        // But localStorage is string.
                                        // Let's assume hex string for now or direct raw bytes if encoded

                                        // For now, let's just log
                                        console.log('Found key in storage:', key.substring(0, 10) + '...');

                                        // Respond with the key
                                        // Need to convert hex string to ArrayBuffer
                                        const buffer = new Uint8Array(key.match(/[\da-f]{2}/gi).map(h => parseInt(h, 16))).buffer;

                                        resolve({
                                            uri: uri,
                                            data: buffer,
                                            headers: {}
                                        });
                                    } else if (attempts >= maxAttempts) {
                                        clearInterval(interval);
                                        reject(new shaka.util.Error(
                                            shaka.util.Error.Severity.CRITICAL,
                                            shaka.util.Error.Category.NETWORK,
                                            shaka.util.Error.Code.TIMEOUT
                                        ));
                                    }
                                }, 100);
                            });
                        }
                        return null;
                    });
                    console.log('[IPTVWatch] Using extension for key harvesting');
                }

                // Configure player
                const config = {
                    streaming: {
                        bufferingGoal: 30, // Increase buffering to handle network fluctuations
                        rebufferingGoal: 5,
                        bufferBehind: 10,
                        retryParameters: {
                            maxAttempts: 5,
                            baseDelay: 1000,
                            backoffFactor: 2,
                            fuzzFactor: 0.5,
                            timeout: 0 // Infinite timeout
                        },
                        ignoreTextStreamFailures: true // Ignore subtitle failures
                    },
                    manifest: {
                        retryParameters: {
                            maxAttempts: 5,
                            baseDelay: 1000,
                            timeout: 0
                        }
                    }
                };

                // Add DRM configuration if present
                if (channel.licenseKey) {
                    try {
                        const keyString = channel.licenseKey.trim();

                        // Check if it's a License Key URL (Widevine/PlayReady server)
                        if (keyString.startsWith('http')) {
                            // Determine PlayReady URL - use separate field or same as Widevine
                            const playReadyUrl = channel.playReadyLicenseKey || keyString;

                            config.drm = {
                                servers: {
                                    'com.widevine.alpha': keyString,
                                    'com.microsoft.playready': playReadyUrl,
                                },
                                retryParameters: {
                                    maxAttempts: 3,
                                    timeout: 15000,
                                    baseDelay: 1000,
                                    backoffFactor: 2
                                },
                                advanced: {
                                    'com.widevine.alpha': {
                                        videoRobustness: 'SW_SECURE_CRYPTO',
                                        audioRobustness: 'SW_SECURE_CRYPTO'
                                    },
                                    'com.microsoft.playready': {
                                        videoRobustness: '',
                                        audioRobustness: ''
                                    }
                                }
                            };

                            // Add custom headers support for Widevine/PlayReady license requests
                            // Channel can specify: licenseHeaders: { 'Authorization': 'Bearer xxx', 'X-Custom': 'value' }
                            if (channel.licenseHeaders && Object.keys(channel.licenseHeaders).length > 0) {
                                player.getNetworkingEngine().registerRequestFilter((type, request) => {
                                    if (type === shaka.net.NetworkingEngine.RequestType.LICENSE) {
                                        // Add custom headers to license requests
                                        for (const [headerName, headerValue] of Object.entries(channel.licenseHeaders)) {
                                            request.headers[headerName] = headerValue;
                                        }
                                        console.log('[IPTVWatch] Added custom headers to license request:', Object.keys(channel.licenseHeaders));
                                    }
                                });
                            }

                            console.log('[IPTVWatch] Configured DRM License Servers - Widevine:', keyString, 'PlayReady:', playReadyUrl);

                        } else if (keyString.includes(':')) {
                            // ClearKey format (id:key) - supports single key or multiple keys
                            // Single: keyId:key
                            // Multiple: keyId1:key1,keyId2:key2
                            const clearKeys = {};
                            const keyPairs = keyString.split(',');

                            for (const pair of keyPairs) {
                                const [keyId, key] = pair.trim().split(':');
                                if (keyId && key) {
                                    clearKeys[keyId.trim()] = key.trim();
                                }
                            }

                            if (Object.keys(clearKeys).length > 0) {
                                config.drm = {
                                    clearKeys: clearKeys,
                                    preferredKeySystems: ['org.w3.clearkey'],
                                    retryParameters: {
                                        timeout: 10000,
                                        maxAttempts: 3,
                                        baseDelay: 500,
                                        backoffFactor: 2
                                    },
                                    advanced: {
                                        'org.w3.clearkey': {
                                            videoRobustness: '',
                                            audioRobustness: ''
                                        }
                                    }
                                };
                                console.log('[IPTVWatch] Configured ClearKey DRM with', Object.keys(clearKeys).length, 'key(s)');
                            }
                        } else {
                            console.warn('[IPTVWatch] Unrecognized Key format:', keyString);
                        }
                    } catch (e) {
                        console.warn('[IPTVWatch] Failed to configure DRM:', e);
                    }
                }

                player.configure(config);

                // Add error listener - only show UI for critical errors
                player.addEventListener('error', (event) => {
                    const shakaError = event.detail;
                    // Safely stringify error for logging to avoid 'U' minified output issues
                    console.error('Shaka Player Error:', JSON.stringify(shakaError, null, 2));

                    // Only show error UI for CRITICAL severity errors
                    // Severity.RECOVERABLE (1) means playback can continue
                    // Severity.CRITICAL (2) means playback cannot continue
                    if (shakaError.severity === shaka.util.Error.Severity.CRITICAL) {
                        setError(`Playback error: Code ${shakaError.code} (${shakaError.category}) - ${shakaError.message || 'Unknown Error'}`);
                        markChannelOffline(channel?.id);
                    } else {
                        // Log recoverable errors but don't show UI
                        console.warn('[IPTVWatch] Recoverable error (playback continues):', shakaError.code, shakaError.message);
                    }
                });

                // Add debugging listeners
                player.addEventListener('drmsessionupdate', () => {
                    console.log('DRM session updated');
                });

                // Load the stream
                console.log('Loading stream:', streamUrl);

                // Determine MIME type
                let mimeType = null;
                const originalUrl = channel.url;
                if (originalUrl.endsWith('.mpd')) {
                    mimeType = 'application/dash+xml';
                } else if (originalUrl.endsWith('.m3u8')) {
                    mimeType = 'application/x-mpegurl';
                } else if (originalUrl.endsWith('.css') && channel.mappleId) {
                    // Mapple masked HLS
                    mimeType = 'application/x-mpegurl';
                }

                await player.load(streamUrl, 0, mimeType);
                console.log('Stream loaded successfully');

                setLoading(false);
                resetHideTimer();

                try {
                    await videoRef.current.play();
                } catch (playError) {
                    console.log('Autoplay blocked, user interaction required');
                }
            } catch (err) {
                console.error('Error initializing player:', err);
                setError(`Failed to load stream: ${err.message}`);
                setLoading(false);
                // Mark channel as offline
                markChannelOffline(channel?.id);
            }
        };

        // No need to wait for key - proxy server handles everything
        initPlayer();
    }, [playerLoaded, channel]); // Re-init when channel changes

    // Mark channel as offline in localStorage
    const markChannelOffline = (channelId) => {
        try {
            const saved = localStorage.getItem(OFFLINE_CHANNELS_KEY);
            const offlineList = saved ? JSON.parse(saved) : [];
            if (!offlineList.includes(channelId)) {
                offlineList.push(channelId);
                localStorage.setItem(OFFLINE_CHANNELS_KEY, JSON.stringify(offlineList));
            }
        } catch (e) {
            console.error('Error saving offline channel:', e);
        }
    };

    // Handle back navigation
    const handleBack = () => {
        navigate('/iptv');
    };

    // Toggle fullscreen
    const toggleFullscreen = () => {
        if (!containerRef.current) return;

        const elem = containerRef.current;
        const doc = document;

        const isCurrentlyFullscreen = doc.fullscreenElement ||
            doc.webkitFullscreenElement ||
            doc.mozFullScreenElement ||
            doc.msFullscreenElement ||
            isFullscreen;

        if (!isCurrentlyFullscreen) {
            if (elem.requestFullscreen) {
                elem.requestFullscreen().catch(() => setIsFullscreen(true));
            } else if (elem.webkitRequestFullscreen) {
                elem.webkitRequestFullscreen();
                setIsFullscreen(true);
            } else if (elem.mozRequestFullScreen) {
                elem.mozRequestFullScreen();
                setIsFullscreen(true);
            } else {
                setIsFullscreen(true);
            }
        } else {
            if (doc.exitFullscreen) {
                doc.exitFullscreen().catch(() => setIsFullscreen(false));
            } else if (doc.webkitExitFullscreen) {
                doc.webkitExitFullscreen();
                setIsFullscreen(false);
            } else {
                setIsFullscreen(false);
            }
        }
    };

    // Fallback if no channel provided (though we force test channel now)
    // We can keep the fallback UI for when we remove the test code
    if (!channel && !playerLoaded) {
        // Allow rendering even without channel state to trigger the useEffect with test channel
        // But initial render needs something
    }

    return (
        <div
            className={`iptv-watch-fullscreen${isFullscreen ? ' css-fullscreen-mode' : ''}`}
            ref={containerRef}
            onMouseMove={resetHideTimer}
            onTouchStart={resetHideTimer}
        >
            {/* Video Player - Lazy Loaded */}
            {playerLoaded ? (
                <>
                    <video
                        ref={videoRef}
                        className="iptv-video-player"
                        controls
                        autoPlay
                        playsInline
                    />
                    {loading && (
                        <div className="iptv-watch-loading-overlay">
                            <div className="loading-spinner"></div>
                            <p>Loading stream...</p>
                        </div>
                    )}
                    {error && (
                        <div className="iptv-watch-error-overlay">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="48" height="48">
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                            </svg>
                            <h1>Playback Error</h1>
                            <p>{error}</p>
                            <button className="iptv-watch-overlay-btn" onClick={() => window.location.reload()}>
                                Retry
                            </button>
                        </div>
                    )}
                </>
            ) : (
                <div
                    className="iptv-watch-lazy-overlay"
                    style={channel?.logo ? {
                        backgroundImage: `url(${channel.logo})`,
                        backgroundSize: '50%',
                        backgroundPosition: 'center',
                        backgroundRepeat: 'no-repeat'
                    } : {}}
                >
                    <div className="iptv-watch-lazy-gradient"></div>
                    <div className="iptv-watch-lazy-content">
                        <button
                            className="iptv-watch-play-button"
                            onClick={() => setPlayerLoaded(true)}
                            aria-label="Play channel"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M8 5v14l11-7z" />
                            </svg>
                        </button>
                        <p className="iptv-watch-lazy-title">{channel?.name || 'AMC USA Test'}</p>
                        <p className="iptv-watch-lazy-hint">Click to start streaming</p>
                    </div>
                </div>
            )}

            {/* Back Button */}
            <button
                className={`iptv-watch-overlay-btn iptv-watch-back-btn${!controlsVisible && playerLoaded ? ' controls-hidden' : ''}`}
                onClick={handleBack}
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m12 19-7-7 7-7"></path>
                    <path d="M19 12H5"></path>
                </svg>
                Back
            </button>

            {/* Live Badge - Top Center */}
            <div className={`iptv-watch-live-badge${!controlsVisible && playerLoaded ? ' controls-hidden' : ''}`}>
                <span className="iptv-live-indicator">LIVE</span>
                <span className="iptv-watch-channel-name">{channel?.name || 'AMC USA Test'}</span>
                {/* Channel Strip Toggle */}
                {channels.length > 0 && (
                    <button
                        className="iptv-watch-badge-btn"
                        onClick={toggleChannelStrip}
                        tabIndex={0}
                        aria-label="Show channel list"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="2" y="3" width="20" height="14" rx="2" />
                            <path d="M8 21h8" /><path d="M12 17v4" />
                        </svg>
                    </button>
                )}
                <button
                    className="iptv-watch-badge-btn"
                    onClick={toggleFullscreen}
                    aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                >
                    {isFullscreen ? (
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M8 3v3a2 2 0 0 1-2 2H3"></path>
                            <path d="M21 8h-3a2 2 0 0 1-2-2V3"></path>
                            <path d="M3 16h3a2 2 0 0 1 2 2v3"></path>
                            <path d="M16 21v-3a2 2 0 0 1 2-2h3"></path>
                        </svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 8V5a2 2 0 0 1 2-2h3"></path>
                            <path d="M16 3h3a2 2 0 0 1 2 2v3"></path>
                            <path d="M21 16v3a2 2 0 0 1-2 2h-3"></path>
                            <path d="M8 21H5a2 2 0 0 1-2-2v-3"></path>
                        </svg>
                    )}
                </button>
            </div>
            {/* Harvester Iframe - Loads Mapple to generate keys (extension captures them) */}
            {channel?.mappleId && (
                <iframe
                    src={`https://mapple.uk/watch/channel/${channel.mappleId}`}
                    style={{
                        position: 'absolute',
                        width: '1px',
                        height: '1px',
                        opacity: 0.01,
                        pointerEvents: 'none',
                        top: 0,
                        left: 0,
                        zIndex: -1
                    }}
                    allow="autoplay; encrypted-media"
                    title="Key Harvester"
                />
            )}



            {/* Channel Strip Overlay */}
            {showChannelStrip && channels.length > 0 && (
                <div className="channel-strip-overlay" role="dialog" aria-label="Channel selector">
                    <div className="channel-strip-header">All Channels ({channels.length})</div>
                    <div
                        className="channel-strip-list"
                        onTouchStart={resetChannelStripTimer}
                        onTouchMove={resetChannelStripTimer}
                        onScroll={resetChannelStripTimer}
                    >
                        {channels.map((ch, idx) => (
                            <button
                                key={ch.id}
                                ref={el => channelRefs.current[idx] = el}
                                className={`channel-strip-item${idx === currentIndex ? ' active' : ''}`}
                                onClick={() => switchChannel(ch, idx)}
                                onFocus={resetChannelStripTimer}
                                tabIndex={0}
                                aria-label={`${ch.name}${idx === currentIndex ? ' (current)' : ''}`}
                                aria-pressed={idx === currentIndex}
                            >
                                <div className="channel-strip-logo">
                                    {ch.logo ? (
                                        <img src={ch.logo} alt="" loading="lazy" />
                                    ) : (
                                        <span>{ch.name.charAt(0)}</span>
                                    )}
                                </div>
                                <span className="channel-strip-name">{ch.name}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default IPTVWatch;
