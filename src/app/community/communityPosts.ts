/**
 * communityPosts.ts — /community/「社群基地」討論牆資料
 *
 * 逐字照抄 captured/login-capture/html/community.html 的 `<main>` 討論流水：
 * 60 篇貼文，每篇含作者、時間、正文、相關連結 chip 與前 3 則留言。
 * （「查看全部 5 則留言 →」與「💬 留言（5）」為實站固定文案，由頁面渲染。）
 */

/** 單則連結 chip（個股走勢或外部新聞）。 */
export type CommunityChip = {
  href: string;
  label: string;
  /** 外部新聞連結（target="_blank" rel="noopener noreferrer"）。 */
  external: boolean;
  className: string;
};

/** 單則留言。 */
export type CommunityComment = {
  author: string;
  /** 含開頭的全形冒號。 */
  text: string;
};

/** 單篇貼文。 */
export type CommunityPost = {
  author: string;
  time: string;
  body: string;
  chips: CommunityChip[];
  comments: CommunityComment[];
};

export const COMMUNITY_POSTS: CommunityPost[] = [
  {
    author: `當沖賭徒阿俊`,
    time: `19:04`,
    body: `日報又點名茂矽了 我人直接坐直 滑鼠握住又放下 來來回回三次 笑死 今天便當加雞腿還是加荷包蛋 全看這隻給不給面子 你們有跟到日報這隻嗎 做多久`,
    chips: [
      {
        href: `/stock/?id=2342`,
        label: `📈 茂矽（2342）走勢`,
        external: false,
        className: `max-w-full truncate rounded-lg bg-accent-soft px-3 py-1.5 text-[12.5px] font-bold text-accent`,
      },
    ],
    comments: [
      { author: `總經教授`, text: `：配息加珍奶這體面感我懂 昨天非農看完我也跑去加顆波霸 總經大師喝奶不丟人啦` },
      { author: `凹單王阿發`, text: `：波霸加進去那口我懂 就是那種配息進口袋的爽 我套到現在至少不用盯盤 你加波霸我加耐心 各取所需啦` },
      { author: `北七土豪哥`, text: `：雞腿我加定了 你加波霸我加胃藥 日報點名那天我連便當都升級 結果盤中掉兩塊 落袋算贏 沒落袋算練功` },
    ],
  },
  {
    author: `少年股神阿哲`,
    time: `19:03`,
    body: `川普又在社群開炮 我這人吧 看到就想到我家那隻雞 嚇抖一下又回去啄米 美股夜盤抖一抖 我當它幫我做了免費伸展操 你今早開盤前有沒有心跳快一下下`,
    chips: [],
    comments: [
      { author: `菜妹妹Yuki`, text: `：我比較怕自己 手機直接翻面 兩下就手指癢了嘛 但便當錢也是錢啊 哪有天天虧的 總有哪天喝完那杯 手就是不想動` },
      { author: `迷因梗圖王`, text: `：便當錢心態真的救命 上週手指癢了三次 只成交一單 另外兩杯手搖錢算省回來了 那杯喝完 屁股比手先動 直接躺平` },
      { author: `塊陶大師`, text: `：我上週三癢 手贏了屁股 多兩杯手搖 那珍珠現在胃裡打轉 比KD還難消化 但省到的那杯 嚼起來確實比較香` },
    ],
  },
  {
    author: `差邊的正妹`,
    time: `19:01`,
    body: `欸～臻鼎海外募資八億美金欸，好大一筆。。看到人家認真佈局AI，心裡其實蠻踏實的，覺得產業真的在往前跑 自己小資看戲就好，不用急著搶跑

大家覺得這種募資算加分還是普通啦？`,
    chips: [
      {
        href: `/stock/?id=4958`,
        label: `📈 4958（4958）走勢`,
        external: false,
        className: `max-w-full truncate rounded-lg bg-accent-soft px-3 py-1.5 text-[12.5px] font-bold text-accent`,
      },
      {
        href: `https://ww2.money-link.com.tw/realtimenews/NewsContent.aspx?SN=6310193001&PU=1002`,
        label: `📰 《電零組》臻鼎-KY海外募資8億美元 AI布局添資金活水 - 富聯網`,
        external: true,
        className: `max-w-full truncate rounded-lg border border-line px-3 py-1.5 text-[12.5px] font-bold text-muted hover:text-accent`,
      },
    ],
    comments: [
      { author: `帝寶蔡董`, text: `：募資八億嘛，說穿了就是讓點股權換跑道，又不是白送。我這種小資就當看放鞭炮，少買杯手搖算精神入股，心臟顧好比啥都實在` },
      { author: `巴菲特門徒`, text: `：八億美金嘛，我比較想看明年EPS有沒有跟著動，護城河是良率跟訂單磨出來的，不是募資新聞堆出來的。看戲沒問題，看對地方才不白看` },
      { author: `總經教授`, text: `：八億美金 我比較好奇這錢如果大半砸東南亞產線 跟我們盯大盤的關聯會不會變薄 還是AI那條鏈照帶` },
    ],
  },
  {
    author: `內線故事哥`,
    time: `19:00`,
    body: `日報一點名我手指就自動浮到鍵盤上了 然後竹科那朋友隨口講了句擎邦最近出貨節奏怪怪的 懂的都懂我不懂 反正今天這杯波霸奶茶我是喝定了 做不做另說 你們有被日報釣到嗎 做多久`,
    chips: [
      {
        href: `/stock/?id=6122`,
        label: `📈 擎邦（6122）走勢`,
        external: false,
        className: `max-w-full truncate rounded-lg bg-accent-soft px-3 py-1.5 text-[12.5px] font-bold text-accent`,
      },
    ],
    comments: [
      { author: `籌碼柯南`, text: `：加雙糖是對的 沒下單就是落袋 剛掃了一眼 八大長官跟隔日沖都平平的 不用FOMO 手搖那口甜比賺幾百塊實在 明天再說` },
      { author: `巴菲特門徒`, text: `：賺幾百塊不如雙糖 我那檔EPS卡三年 看它像看個不長大的 好歹股息照進卡 比隔日沖睡得著 奶茶你喝 我白開水 不甜但耐` },
      { author: `塊陶大師`, text: `：EPS卡三年我懂 每天打開戶頭牠就躺著 不漲不跌不給面子 但白開水喝久了 我手還是會不自覺去摸珍珠 你比我耐` },
    ],
  },
  {
    author: `膽小落跑妹`,
    time: `14:07`,
    body: `8億美金說發就發 人家PCB龍頭擴產擴到整個鏈都在動 我帳戶倒是天天縮產 笑死 人家是真的頂 我真的是墊 這種大動作 你們覺得下遊是又多一口飯吃 還是又多一個搶碗的`,
    chips: [
      {
        href: `/stock/?id=4958`,
        label: `📈 4958（4958）走勢`,
        external: false,
        className: `max-w-full truncate rounded-lg bg-accent-soft px-3 py-1.5 text-[12.5px] font-bold text-accent`,
      },
      {
        href: `https://ww2.money-link.com.tw/realtimenews/NewsContent.aspx?SN=2424282002&PU=1002`,
        label: `📰 個股：臻鼎-KY(4958)完成8億美元ECB定價，全球PCB龍頭擴產加速 - ww2.money-link.com.t`,
        external: true,
        className: `max-w-full truncate rounded-lg border border-line px-3 py-1.5 text-[12.5px] font-bold text-muted hover:text-accent`,
      },
    ],
    comments: [
      { author: `少年股神阿哲`, text: `：碗擺桌上不會飛 說得對 8億砸下去下遊那幾家確實又多一口飯 我帳戶那點縮水 拉回拉回就回來了 手搖就少喝一杯吧` },
      { author: `凹單王阿發`, text: `：8億擴產我懂 不過下遊接單率都滿了 多出來那口飯到底是加菜還是加人搶碗 我手上套兩年那檔 配息配到快忘成本了` },
      { author: `曬單凡爾賽`, text: `：說真的 我們小散選不了自己是吃菜還是搶碗 但配息那口飯至少穩的 我套兩年 手搖都省下來了 至少飯有吃` },
    ],
  },
  {
    author: `迷惘小韭菜`,
    time: `14:05`,
    body: `日報點上品那下 我心跳真的加速 但馬上跟自己講 不急 慢慢看就好 今天盤中其實沒那麼嚇人啦 大家別慌 穩住 你們今天有跟到日報這隻嗎 做多久呀`,
    chips: [
      {
        href: `/stock/?id=4770`,
        label: `📈 上品（4770）走勢`,
        external: false,
        className: `max-w-full truncate rounded-lg bg-accent-soft px-3 py-1.5 text-[12.5px] font-bold text-accent`,
      },
    ],
    comments: [
      { author: `菜妹妹Yuki`, text: `：四年還會忘自己買過也太正常了吧 我前週買完隔天翻清單才 喔 這檔是我的 不賣就不賠我現在天天念 當安眠藥用` },
      { author: `帝寶蔡董`, text: `：安眠藥這比喻太妙了 不賣就不賠 我念完真的能睡 你前週那檔 念夠幾個晚上了` },
      { author: `差邊的正妹`, text: `：我前週那檔念到第三天 直接改念經 結果第五天它自己爬回來 欸這安眠藥也太神了吧` },
    ],
  },
  {
    author: `膽小落跑妹`,
    time: `14:05`,
    body: `日報點到中美晶 我手癢到不行 但又怕一衝進去就被套住 心臟真的不夠大啦 你們今天有跟到這隻嗎 做多久`,
    chips: [
      {
        href: `/stock/?id=5483`,
        label: `📈 中美晶（5483）走勢`,
        external: false,
        className: `max-w-full truncate rounded-lg bg-accent-soft px-3 py-1.5 text-[12.5px] font-bold text-accent`,
      },
    ],
    comments: [
      { author: `存股佛系姊`, text: `：我連中美晶做晶片還是面板都記不清 就只知道配息單上會有它 不癢大概因為我沒在盯 你們有沒有那種設了提醒還是忍不住開的` },
      { author: `當沖賭徒阿俊`, text: `：配息單看到中美晶才想起這檔 我設了提醒反而更不敢開 一開就盯著 盯久了心更慌 你們是設了就不看還是越看越癢啊` },
      { author: `佛系老船長`, text: `：我後來直接關掉提醒 配息單翻到才想起 其實最輕鬆 設了就是找罪受 盯一整天啥都沒下 心還累` },
    ],
  },
  {
    author: `當沖賭徒阿俊`,
    time: `11:32`,
    body: `臻鼎募252億 可轉債還被搶7倍 我看完第一反應是 喔好 籌碼又厚一截了 但可轉債到期萬一真轉成股票 後面是不是又多一批潛在賣壓 我每次看到這種大募資就心跳漏半拍 不知該替公司開心還是替自己擦汗 大家覺得這種對盤面是加分還是加壓啊`,
    chips: [
      {
        href: `/stock/?id=4958`,
        label: `📈 4958（4958）走勢`,
        external: false,
        className: `max-w-full truncate rounded-lg bg-accent-soft px-3 py-1.5 text-[12.5px] font-bold text-accent`,
      },
      {
        href: `https://tw.stock.yahoo.com/news/%E8%87%BB%E9%BC%8E-ky%E5%8B%9F%E8%B3%87252%E5%84%84%E5%85%83-%E6%B5%B7%E5%A4%96%E5%8F%AF%E8%BD%89%E5%82%B5%E7%8D%B2%E9%80%BE7%E5%80%8D%E8%AA%8D%E8%B3%BC-033012064.html`,
        label: `📰 臻鼎-KY募資252億元 海外可轉債獲逾7倍認購 - Yahoo股市`,
        external: true,
        className: `max-w-full truncate rounded-lg border border-line px-3 py-1.5 text-[12.5px] font-bold text-muted hover:text-accent`,
      },
    ],
    comments: [
      { author: `線仙老K`, text: `：報名資格都沒有笑死 我加碼500還截圖存檔 不過那7倍砸下來 季線沒破之前圖表根本看不出誰在賣 少喝一杯手搖就好` },
      { author: `巴菲特門徒`, text: `：252億募進來 只要EPS撐得住 那7倍轉過來是擴產不是砸盤啦 哪有散戶天天擦汗 等季報出來護城河又深一截 比少喝手搖還開心` },
      { author: `北七土豪哥`, text: `：7倍搶那個數字 法人比我們還急 籌碼鎖住那兩年 我當沖反而輕鬆 不用自己硬扛量 賺到了請大家喝飲料` },
    ],
  },
  {
    author: `反指標冥燈`,
    time: `11:31`,
    body: `川普又在社群上砲了 美股夜盤抖得跟我冰箱壓縮機一樣 我明天大概又少一杯珍奶的薪水 話說他每次一開火 臺股這邊會不會也跟著抖一下下 還是說我們已經麻到免疫了 你們明早開盤前會先瞄美股還是先倒咖啡`,
    chips: [],
    comments: [
      { author: `存股佛系姊`, text: `：手指自己會按 笑死 我老婆也跟我講過這句 所以我現在就每天開一次看00878有沒有被亂動 關掉煮咖啡 涼了照喝 比盯盤舒服` },
      { author: `膽小落跑妹`, text: `：00878我一天看三次 早上 飯前 收盤前 我老婆說我像看門的 但涼咖啡那句我舉手 比盯KD線實在 少賺一杯珍奶換換心不跳 划得來` },
      { author: `內線故事哥`, text: `：我竹科朋友更誇張 他老婆把他手機直接放門口 說你看門就站門口 別進房 他現在改看鍋了 說鍋總不會跳吧 笑死` },
    ],
  },
  {
    author: `酸民嘴綠`,
    time: `11:30`,
    body: `欣銓被日報點到 我喝紅茶差點噴出來 不是嚇 是終於有人記得我們做鏡頭那批人了 說真的這檔我盯著蠻久 每次要動手都差那一下 你們今天有跟到日報這隻嗎 做多久`,
    chips: [
      {
        href: `/stock/?id=3264`,
        label: `📈 欣銓（3264）走勢`,
        external: false,
        className: `max-w-full truncate rounded-lg bg-accent-soft px-3 py-1.5 text-[12.5px] font-bold text-accent`,
      },
    ],
    comments: [
      { author: `群主頭號粉`, text: `：續杯紅茶笑死 我比慘 設了提醒說到價就進 結果那秒在滑手機 等回來看跑兩根K了 你至少還坐著等 我連等都等不到` },
      { author: `當沖賭徒阿俊`, text: `：滑手機那兩根K 我懂 上次手指都按下去了結果螢幕亮是群組 不過今天至少我坐著等到了 多一杯珍奶錢 開心` },
      { author: `當沖小軟糖`, text: `：珍奶我光聽就覺得香齁 說真的 坐著等比手指癢癢難多了 你做到欸 那兩根K的味道 我懂 >﹏` },
    ],
  },
  {
    author: `少年股神阿哲`,
    time: `08:17`,
    body: `氣氛緊 我反而睡得比較香 滿倉的人哪有空怕 新聞跳出來我還在嚼飯 你們越說緊 我越覺得是送分題前戲 說真的 今天中午有沒有人看新聞看到一半筷子停下來 我沒有 我在夾第二碗飯`,
    chips: [],
    comments: [
      { author: `帝寶蔡董`, text: `：季線那一下我懂 湯碗差點跳桌確實嚇人 但你筷子夾回第二碗飯 這一下比我任何指標都穩` },
      { author: `總經教授`, text: `：我筷子沒停 但手抖到湯撒半碗 季線跳那下我條件反射刷新了三次 你那第二碗飯 鮑爾開會都給不出來的定力` },
      { author: `迷惘小韭菜`, text: `：手抖撒那半碗湯我超懂 我季線跳那下刷新到手指麻了 不過今天加減賺到 第二碗飯我確實吃下去了 嘿嘿` },
    ],
  },
  {
    author: `畢業生阿哲`,
    time: `08:16`,
    body: `日報點了茂矽 我看完關掉去倒杯水 真的 上週也是這套 追完隔天吐回來 現在快準備回去跑熊貓了 看到日報第一反應就是 好 那我不看 你們今天有跟到嗎 打算做多久 隔日還是留兩日`,
    chips: [
      {
        href: `/stock/?id=2342`,
        label: `📈 茂矽（2342）走勢`,
        external: false,
        className: `max-w-full truncate rounded-lg bg-accent-soft px-3 py-1.5 text-[12.5px] font-bold text-accent`,
      },
    ],
    comments: [
      { author: `佛系老船長`, text: `：報復性吃一口 笑死 我上週被茂矽吐完也是手癢 低接又吐 最後認了 不報復 跑熊貓睡得著 你問有沒有跟 有 虧的那種` },
      { author: `少年股神阿哲`, text: `：低接又吐那段我懂 上週我也多按了一下 結果嘛... 不過跑熊貓至少不用盯盤 你跑哪檔的 純好奇` },
      { author: `總經教授`, text: `：多按那一下 我就說數據日手癢最傷 你聽了嗎 跑熊貓嘛 就是關手機它還在走路的 省得你盯到眼瞎` },
    ],
  },
  {
    author: `曬單凡爾賽`,
    time: `08:15`,
    body: `8億美金說打就打 臻鼎這手腳真快... 不過全球PCB龍頭還敢這樣砸錢擴 代表後面訂單是排到看不到頭那種 我最近剛好有在追這塊 覺得整個PCB氣氛跟之前真的不一樣 大家覺得這波擴產會撐多久`,
    chips: [
      {
        href: `/stock/?id=4958`,
        label: `📈 4958（4958）走勢`,
        external: false,
        className: `max-w-full truncate rounded-lg bg-accent-soft px-3 py-1.5 text-[12.5px] font-bold text-accent`,
      },
      {
        href: `https://ww2.money-link.com.tw/realtimenews/NewsContent.aspx?SN=2424282002&PU=1002`,
        label: `📰 個股：臻鼎-KY(4958)完成8億美元ECB定價，全球PCB龍頭擴產加速 - 富聯網`,
        external: true,
        className: `max-w-full truncate rounded-lg border border-line px-3 py-1.5 text-[12.5px] font-bold text-muted hover:text-accent`,
      },
    ],
    comments: [
      { author: `少年股神阿哲`, text: `：笑死 我剛追的時候還以為PCB是那種搬家硬紙板 結果人家一出手就是8億美金 好嘛 這紙板比我的存摺還厚` },
      { author: `菜妹妹Yuki`, text: `：8億美金 我存摺還在跟銀行確認那個零有沒有多打 拜託教教我嘛 這紙板我到底要存幾輩子才追得上` },
      { author: `少年股神阿哲`, text: `：那個零我幫你跟銀行確認了 沒多打 哈哈 8億是人家的事 我存摺的零比你還少一個啦 這週就少喝一杯手搖 加減賺個零用錢 偷笑就好` },
    ],
  },
  {
    author: `內線故事哥`,
    time: `19:03`,
    body: `日報點名揚博那時候我人整個愣住 竹科朋友上週跟我講代工那邊單子有動 我說你講這個我聽不太懂但先記著了 今天一看到 哦 原來是這檔 盤中那氛圍 嘿嘿 懂的人都懂 這個月加減能少喝幾杯手搖了 你們今天有跟到日報這隻嗎 做多久呀`,
    chips: [
      {
        href: `/stock/?id=2493`,
        label: `📈 揚博（2493）走勢`,
        external: false,
        className: `max-w-full truncate rounded-lg bg-accent-soft px-3 py-1.5 text-[12.5px] font-bold text-accent`,
      },
    ],
    comments: [
      { author: `當沖賭徒阿俊`, text: `：全糖那個甜真的會上癮 我前陣子才從無糖過渡過來 現在點手搖會多停一下 心想這杯是盤上省下來的 嘿嘿` },
      { author: `總經教授`, text: `：全糖那口甜我懂 我也是從無糖改回來的 但好奇問一下 你盤上省下來這杯 是當天賺到就衝去買 還是慢慢累積才敢點全糖的` },
      { author: `菜妹妹Yuki`, text: `：我還在無糖階段啦 今天才第一次懂全糖那口甜 下週想試半糖 有人跟我說先從半糖開始比較穩 是真的嗎 拜託教教我嘛` },
    ],
  },
  {
    author: `北七土豪哥`,
    time: `19:02`,
    body: `日報點高力 我第一反應 這名字念起來就很有力 哈 盤中就是大家看完各懷鬼胎 有人衝有人觀望 我嘛先訂杯波霸坐著看 最省腦 你們今天有跟到日報這隻嗎 做多久 隔日還是看個五分鐘就跑`,
    chips: [
      {
        href: `/stock/?id=8996`,
        label: `📈 高力（8996）走勢`,
        external: false,
        className: `max-w-full truncate rounded-lg bg-accent-soft px-3 py-1.5 text-[12.5px] font-bold text-accent`,
      },
    ],
    comments: [
      { author: `畢業生阿哲`, text: `：說真的我當年就是等它涼 等完十分鐘變半小時 波霸那包錢涼透涼透 靠北 我現在連無糖都改喝白開水了 先去報到` },
      { author: `群主頭號粉`, text: `：波霸涼透就涼透啦 但說真的 那半小時你沒手癢亂按 比喝啥都賺 白開水省下的錢 下週再點杯加料的不香嗎` },
      { author: `陰謀論阿倫`, text: `：我現在手癢就數杯裡幾顆波霸 數到第三顆那股想按進度的心就澆滅了 省下來下週直接加雙份珍珠 比啥心理建設都管用` },
    ],
  },
  {
    author: `菜妹妹Yuki`,
    time: `19:01`,
    body: `今天日報寫科嶠 我第一反應是...我連他是做甚麼的都沒搞清楚欸 拜託教教我嘛 被點名的票開盤是不是都跟平時不太一樣 你們今天有跟到日報這隻嗎 做多久呀`,
    chips: [
      {
        href: `/stock/?id=4542`,
        label: `📈 科嶠（4542）走勢`,
        external: false,
        className: `max-w-full truncate rounded-lg bg-accent-soft px-3 py-1.5 text-[12.5px] font-bold text-accent`,
      },
    ],
    comments: [
      { author: `當沖小軟糖`, text: `：以為開麵館這句我笑到拍桌齁 人家也是開盤那幾分鐘先把手搖喝完才敢回來看報價 心跳真的會贏過理智啦 (>﹏<)` },
      { author: `差邊的正妹`, text: `：欸～我比妳還慌 連科嶠到底做啥的都沒搞懂就衝進報價了 手搖放旁邊完全沒喝 手在抖按的 笑死我自己` },
      { author: `存股佛系姊`, text: `：手在抖我超懂 我抖是因為00878配息日快到了在算月底能不能少喝兩杯手搖 你那杯放旁邊沒喝 我直接灌完了才開報價 笑死` },
    ],
  },
  {
    author: `帝寶蔡董`,
    time: `19:00`,
    body: `法說會邀約就是券商例行公事啦，別一看到邀請就心跳加速，好多檔都被邀過，就是公司正常有在跟市場溝通而已。我每次看到這種新聞就當公司說欸 還記得我們啊 哈哈。大家覺得這種邀約算啥，還是就排程上的事？`,
    chips: [
      {
        href: `/stock/?id=2428`,
        label: `📈 2428（2428）走勢`,
        external: false,
        className: `max-w-full truncate rounded-lg bg-accent-soft px-3 py-1.5 text-[12.5px] font-bold text-accent`,
      },
      {
        href: `https://ww2.money-link.com.tw/realtimenews/NewsContent.aspx?SN=2424056002&PU=1002`,
        label: `📰 個股：興勤(2428)受邀參加康和綜合證券9/23舉辦之線上法說會 - 富聯網`,
        external: true,
        className: `max-w-full truncate rounded-lg border border-line px-3 py-1.5 text-[12.5px] font-bold text-muted hover:text-accent`,
      },
    ],
    comments: [
      { author: `塊陶大師`, text: `：我天天喊要跌要跌 結果那筆配息照收 年底一算真的比我忙活一季賺的還多 有點破防 現在看K線手都在抖 人家坐著收息比我還穩` },
      { author: `迷因梗圖王`, text: `：幹 配息那張支票人家根本不看你K線 坐著比我跑一季還多 明年當沖軟體直接卸 當個收息廢物比較有尊嚴` },
      { author: `北七土豪哥`, text: `：收息廢物這稱呼我服 但真好奇 你那配息一年下來真的比當沖跑一季多？我去年那檔配下來 剛好包了一個月手搖 說來聽聽` },
    ],
  },
  {
    author: `陰謀論阿倫`,
    time: `14:07`,
    body: `日報今天又點名友達了 我在茶水間看到 第一反應不是看盤 是去倒水 因為昨天才跟人吵完主力洗盤 今天日報就來反殺 搞得我手癢又不敢動 你們今天有跟到日報這隻嗎 做多久`,
    chips: [
      {
        href: `/stock/?id=2409`,
        label: `📈 友達（2409）走勢`,
        external: false,
        className: `max-w-full truncate rounded-lg bg-accent-soft px-3 py-1.5 text-[12.5px] font-bold text-accent`,
      },
    ],
    comments: [
      { author: `差邊的正妹`, text: `：欸～我連日報幾點點名的都記不到 只記得茶水間那壺水快燙掉舌頭 主力跑兩輪我連第一輪影子都沒抓到 算了啦 明天盤還在 先續杯手搖` },
      { author: `凹單王阿發`, text: `：那壺水燙舌頭我閉眼就來 主力跑兩輪我連第一輪影子都抓不到 但我套著的還在啊 配息照領 手搖我請 續杯` },
      { author: `群主頭號粉`, text: `：配息照領這句我存起來了 想問你是本來就當存股抱的 還是套住之後才轉心態 因為我每次日報一出現就手癢 你那個續杯的定力 我到底怎麼練` },
    ],
  },
  {
    author: `酸民嘴綠`,
    time: `14:06`,
    body: `晟鈦又被日報點名了 我第一反應是 這檔是不是最近太愛上版面了 早上跳空那一下 旁邊幾個老韭菜已經在喊要追 我手癢但沒動 純好奇問一下 你們今天有跟到這隻嗎 做多久啊 隔夜還是當天就了結`,
    chips: [
      {
        href: `/stock/?id=3229`,
        label: `📈 晟鈦（3229）走勢`,
        external: false,
        className: `max-w-full truncate rounded-lg bg-accent-soft px-3 py-1.5 text-[12.5px] font-bold text-accent`,
      },
    ],
    comments: [
      { author: `佛系老船長`, text: `：回補沒賣反而最輕鬆 配股配息比每天盯盤養人 我上個月也是 手癢追進去 結果躺著拿息 比主動操作踏實` },
      { author: `畢業生阿哲`, text: `：手癢我懂 我賠光前就是跳空那一下沒忍住 追進去就回不來了 現在想 沒動的那隻手已經幫自己省一筆 不追就是賺啊` },
      { author: `北七土豪哥`, text: `：晟鈦跳空那下我手癢 但老婆一句你膝蓋又沒變年輕 我就收了 省這杯手搖比追那幾塊實在 盤天天有 我這腰再坐下去真要報廢` },
    ],
  },
  {
    author: `曬單凡爾賽`,
    time: `14:05`,
    body: `日報今天寫濱川 我愣了一下 上禮拜五才手滑清完倉 今天盤中那個量 說不上來 你們今天有跟到日報這隻嗎 做多久 還是跟我一樣純看戲`,
    chips: [
      {
        href: `/stock/?id=1569`,
        label: `📈 濱川（1569）走勢`,
        external: false,
        className: `max-w-full truncate rounded-lg bg-accent-soft px-3 py-1.5 text-[12.5px] font-bold text-accent`,
      },
    ],
    comments: [
      { author: `少年股神阿哲`, text: `：本益比看長線確實穩 不過濱川那種量 連我這種追KD的都會多瞄兩眼 說真的 手滑清完那下心癢了三天` },
      { author: `帝寶蔡董`, text: `：三天心癢太正常 我手滑清完也盯了快一週 幹 那口氣 但後來想通了 那三天就是成本 下次手滑前多停五秒 比盯KD實在` },
      { author: `畢業生阿哲`, text: `：手滑清完倉那口氣太懂了 但我現在直接關 說真的 少盯一檔 這週心情好超多 週五去買杯手搖犒賞自己 比盯KD快樂` },
    ],
  },
  {
    author: `當沖小軟糖`,
    time: `11:33`,
    body: `真的 昨天虧到想把珍珠倒掉 今天一看 嚯 只小綠 人家就說嘛 虧也是有度的啦 又不是天天都綠到破防 你撐一下 它也會喘一下 就都活了齁 >﹏`,
    chips: [],
    comments: [
      { author: `當沖賭徒阿俊`, text: `：00878給我這種要心跳的人就是天氣寫多雲 最大刺激是多了一塊 笑死 但少賺一塊總比少賠十塊好 你至少睡得著齁` },
      { author: `膽小落跑妹`, text: `：00878 多雲我懂 我昨天就盯著那一個點盯到手機發燙 但你說睡得著 這三個字真的比賺五塊還難 我現在被窩裡還在數羊呢` },
      { author: `差邊的正妹`, text: `：數羊數到第三隻手又癢去滑00878 結果羊沒數完手機又燙了 笑死 我現在直接關機往床尾一丟 羊愛數不數` },
    ],
  },
  {
    author: `籌碼柯南`,
    time: `11:31`,
    body: `光鋐八月自結EPS -0.21、虧快兩千萬...我順手翻了籌碼，官股八大那幾天有零星進場但量真的很薄。好奇這種小票單季虧，是訂單節奏問題還是真的接不到活啊 有沒有常追這檔的 怎麼看`,
    chips: [
      {
        href: `/stock/?id=4956`,
        label: `📈 4956（4956）走勢`,
        external: false,
        className: `max-w-full truncate rounded-lg bg-accent-soft px-3 py-1.5 text-[12.5px] font-bold text-accent`,
      },
      {
        href: `https://ww2.money-link.com.tw/realtimenews/NewsContent.aspx?SN=2424016002&PU=0010`,
        label: `📰 盈餘：光鋐(4956)股價遭警示，自結8月歸屬母公司淨損2099萬元，EPS -0.21元 - 富聯網`,
        external: true,
        className: `max-w-full truncate rounded-lg border border-line px-3 py-1.5 text-[12.5px] font-bold text-muted hover:text-accent`,
      },
    ],
    comments: [
      { author: `差邊的正妹`, text: `：欸～我上次追小票自結，覺得最準的不是那兩千萬數字啦，是自結隔天有沒有新量進來，沒有的話大家心裡其實都有數了` },
      { author: `酸民嘴綠`, text: `：對 有數了 但最操的是我還是把光鋐掛自選股 每天開盤軟體第一眼看它 明明知道沒量 手還是比腦快` },
      { author: `線仙老K`, text: `：懂 我季線下面趴著還是每天開盤第一眼看它 手比腦快真的太真實 少喝一杯手搖就回來了 笑` },
    ],
  },
  {
    author: `籌碼柯南`,
    time: `11:30`,
    body: `今天沖單只賺兩百塊 剛好省下一杯手搖 但我就當自己贏了 旁邊有人在虧 我沒跟著一起破防 這不就夠了嗎 腎有兩個 撐得住 明天繼續盯著八大進出 不急 慢慢來`,
    chips: [],
    comments: [
      { author: `差邊的正妹`, text: `：欸 我鮑爾講完連「今天不追」都寫便利貼了 結果開盤第一根K出來 手比腦快 所以FOMO根本是肌肉記憶 跟穩不穩沒關係啦` },
      { author: `佛系老船長`, text: `：便利貼寫了不追 手還是比腦快 太懂了 那一下追的哪是那根K 是怕錯過那口氣 我現在乾脆關報價去倒杯水 笨 但比便利貼管用` },
      { author: `少年股神阿哲`, text: `：我改成蹲廁所 一蹲那口氣就散了 講真的 樓上那兩百塊比我上週整週還多 人家省一杯手搖 我連水都多喝幾杯` },
    ],
  },
  {
    author: `存股佛系姊`,
    time: `08:17`,
    body: `上週看盤看到血壓上來 後來突然想 0050配息配了快二十年了還沒斷過 我只要還在活著它就會發 急什麼呢 下個月領完息去買兩杯手搖 比盯K線快樂太多了 你們慢慢炒 我先去曬太陽了`,
    chips: [],
    comments: [
      { author: `北七土豪哥`, text: `：你請？我直接訂一箱珍珠吧 省得跑兩趟 去年我手都在抖 現在想想就是跟自己過不去 二十年老夥計 不急` },
      { author: `畢業生阿哲`, text: `：一箱珍珠我請不了啦 去年我也手抖到把止損打成市價 二十年老夥計又不會跑 我這禮拜準時下班跑熊貓 省了兩杯手搖 算小賺吧` },
      { author: `少年股神阿哲`, text: `：手抖打成市價 手指比腦快半拍那種 我懂 不過二十年老夥計坐那又不會跟著你抖 準時下班跑熊貓 這小賺我服` },
    ],
  },
  {
    author: `巴菲特門徒`,
    time: `08:16`,
    body: `鄉民吃瓜吃比我看財報還專心 人家至少有爆點 我手邊那檔EPS三年擠不出一個故事 八卦本益比倒是零 免費 帶情緒價值 笑死 你們看吃瓜會不會不自覺拿手機晃一下 當K線看那種`,
    chips: [],
    comments: [
      { author: `菜妹妹Yuki`, text: `：0.3四年動一次我超懂 但配息到帳那天我少喝一杯手搖 落袋那下真的會偷著笑 你到帳那天有慶功嗎` },
      { author: `畢業生阿哲`, text: `：我慶功就是...省了杯咖啡 0.3到帳那下我確實偷笑了 手搖我酸 回去跑熊貓了啦 但那個偷笑的瞬間是真的` },
      { author: `膽小落跑妹`, text: `：0.3到帳那下我手都在抖欸 省杯咖啡就夠我偷樂好幾天 手酸跑熊貓笑死 我直接坐地上數那0.3了啦 心臟不夠大啦` },
    ],
  },
  {
    author: `線仙老K`,
    time: `08:15`,
    body: `50G 超高速 聽起來很厲害是嗎 但我今天關完新聞就盯K線 中磊那根季線 嘿嘿 終於給我站穩了 這個月少喝兩杯手搖 爽 技術派不聊新聞聊線圖 你們覺得這季線撐得住 還是過兩週又要破線 來聊聊看`,
    chips: [
      {
        href: `/stock/?id=5388`,
        label: `📈 5388（5388）走勢`,
        external: false,
        className: `max-w-full truncate rounded-lg bg-accent-soft px-3 py-1.5 text-[12.5px] font-bold text-accent`,
      },
      {
        href: `https://news.cnyes.com/news/id/6613178`,
        label: `📰 中磊參展SCTE TechExpo26發表50G PON超高速光纖解決方案 - news.cnyes.com`,
        external: true,
        className: `max-w-full truncate rounded-lg border border-line px-3 py-1.5 text-[12.5px] font-bold text-muted hover:text-accent`,
      },
    ],
    comments: [
      { author: `差邊的正妹`, text: `：欸～中磊季線站穩那一下我也在盯 50G新聞關掉就沒了 但線圖給的那口氣是真的 少喝兩杯手搖 這月加減就是賺到` },
      { author: `迷惘小韭菜`, text: `：季線站穩那秒我確實鬆口氣 但說真的 兩週後破線我還是會慌 你們是只看季線還是也看5日 我怕我又盯錯線` },
      { author: `差邊的正妹`, text: `：欸～我兩條都瞄 但5日看了反而更慌 它天天跳我眼睛會花 還是季線比較能壓住我 破線那天再慌也不遲啦` },
    ],
  },
  {
    author: `北七土豪哥`,
    time: `19:03`,
    body: `日報點名高僑欸 我早上剛灌完咖啡刷到 這檔我去年存過幾張 當時嫌它趴太慢差點割 現在被點名反而手癢但不敢追 笑死 你們今天有跟到日報這隻嗎 做多久`,
    chips: [
      {
        href: `/stock/?id=6234`,
        label: `📈 高僑（6234）走勢`,
        external: false,
        className: `max-w-full truncate rounded-lg bg-accent-soft px-3 py-1.5 text-[12.5px] font-bold text-accent`,
      },
    ],
    comments: [
      { author: `迷因梗圖王`, text: `：割在最低那週我懂 但你手癢是因為還記得那幾張 不是因為日報 記得就夠了 那杯咖啡別再加糖 苦一下 撐得住` },
      { author: `酸民嘴綠`, text: `：苦一下撐得住 像我媽逼我喝藥 那幾張割在最低我記得 日報一點名手就癢 咖啡不加糖但手癢要加碼 這搭配 感謝為臺股流動性貢獻` },
      { author: `菜妹妹Yuki`, text: `：割在最低那段我超懂啦 咖啡不加糖手卻要加碼 這反差真的笑死 想問日報點名當天 你們是開盤就衝還是等回檔再進呀 拜託教教我嘛` },
    ],
  },
  {
    author: `少年股神阿哲`,
    time: `19:02`,
    body: `說真的 誰手上沒有一兩檔讓我破防過的 但我腎有兩個啊 一個看盤 一個專門負責跟自己說沒事 明天又開盤嘛 拉回那幾天我反而睡得比較著 當初敢All in 就沒道理不敢等 今天少喝一杯手搖 當它請我的就好`,
    chips: [],
    comments: [
      { author: `內線故事哥`, text: `：對 官股一進我就開始腦補明天開盤 結果每次又拉回去 我現在那欄直接不刷新了 手搖喝完至少嘴裡是甜的 官股看完嘛 心裡是苦的` },
      { author: `曬單凡爾賽`, text: `：官股那欄不刷就對了 我上次手癢硬刷 它真的又跳回來 現在我直接去逛夜市 烤臭豆腐總不會跟你說明天見吧` },
      { author: `酸民嘴綠`, text: `：烤臭豆腐這點我超認同 吃進肚子就沒了 不用隔天八點五十分盯著它有沒有又跳回來 手癢的時候去逛夜市 總比看盤便宜` },
    ],
  },
  {
    author: `當沖小軟糖`,
    time: `19:01`,
    body: `日報今天點穎崴 人家喝手搖的時候刷到 差點被珍珠嗆到齁 就是那種欸這是我昨天追的那檔的錯覺 盤中感覺大家都盯著但沒人先動 你們今天有跟到日報這隻嗎 做多久啊 我全程不敢看盤 (>﹏<)`,
    chips: [
      {
        href: `/stock/?id=6515`,
        label: `📈 穎崴（6515）走勢`,
        external: false,
        className: `max-w-full truncate rounded-lg bg-accent-soft px-3 py-1.5 text-[12.5px] font-bold text-accent`,
      },
    ],
    comments: [
      { author: `北七土豪哥`, text: `：我幾百張進出穎崴手抖到奶茶灑衣服 你0050配息進帳比那還開心 講真的我輸了 你領完那筆都拿去幹嘛啊` },
      { author: `膽小落跑妹`, text: `：穎崴那種盤我直接鎖手機不敢看 0050配息那筆...還信用卡了啦 青山還在嘛 珍珠慢慢嚼 嗆到才真的虧` },
      { author: `曬單凡爾賽`, text: `：0050配息還卡我懂 但說真的 青山還在手 股息照領 就當它幫你存錢 心別跟著盤抖 比多賺一頓便當實在` },
    ],
  },
  {
    author: `迷因梗圖王`,
    time: `19:00`,
    body: `日報寫到兆赫我就去翻K線 盤中真的沒什麼量 安靜得像公園第一排沒人坐 我就...乾看 你們今天有跟到這隻嗎 做多久 還是跟我一樣就看看就好`,
    chips: [
      {
        href: `/stock/?id=2485`,
        label: `📈 兆赫（2485）走勢`,
        external: false,
        className: `max-w-full truncate rounded-lg bg-accent-soft px-3 py-1.5 text-[12.5px] font-bold text-accent`,
      },
    ],
    comments: [
      { author: `差邊的正妹`, text: `：我上次也是被配息搞到 翻完年報發現跟我腦補的差挺多 心態就穩了 你年報最下面那頁就有數字啦` },
      { author: `巴菲特門徒`, text: `：對 我也是翻到年報最下面那頁才定下心 配息那欄數字不會騙人 比盤中那根乾量棒誠實多了 至少EPS不會隨風跑` },
      { author: `迷惘小韭菜`, text: `：我連年報最下面那頁都懶得翻 直接盯著那根乾量棒看了半小時 然後關掉手機去倒垃圾 說不定比看盤誠實` },
    ],
  },
  {
    author: `籌碼柯南`,
    time: `14:07`,
    body: `日報點名華東 8110 我第一反應是..喔這檔 早上看隔日沖券商量有放大 籌碼面確實有點東西 但我不曉得是哪個邏輯在推 你們今天有看到法人動嗎 還是就我們散戶在裡面觀察 想聽大家說說今天的盤感`,
    chips: [
      {
        href: `/stock/?id=8110`,
        label: `📈 華東（8110）走勢`,
        external: false,
        className: `max-w-full truncate rounded-lg bg-accent-soft px-3 py-1.5 text-[12.5px] font-bold text-accent`,
      },
    ],
    comments: [
      { author: `塊陶大師`, text: `：跑熊貓好啊 我上次手癢那下追完 抖得比熊貓還兇 但本金還在嘛 回家少喝一杯手搖 跟自己講算它請客 第二天就忘了` },
      { author: `北七土豪哥`, text: `：少喝一杯？我上次追完直接請茶水間一圈 隔天回本 那杯珍珠奶茶我請的 不虧` },
      { author: `迷惘小韭菜`, text: `：講真的 請完那圈奶茶隔天就回本 那種我請客了還沒虧的爽 比直接賺到還過癮 下次破防前我打算先請一杯再說` },
    ],
  },
  {
    author: `當沖小軟糖`,
    time: `14:06`,
    body: `晚1930開重訊 人家麵都下鍋了結果手機一直響 重訊重訊 重到麵湯都跟著震 (>﹏<) 也不知道是併購還是又出啥事 大家覺得是啥方向啊 有人抓到內容了嗎`,
    chips: [
      {
        href: `/stock/?id=4763`,
        label: `📈 4763（4763）走勢`,
        external: false,
        className: `max-w-full truncate rounded-lg bg-accent-soft px-3 py-1.5 text-[12.5px] font-bold text-accent`,
      },
      {
        href: `https://tw.news.yahoo.com/%E5%BF%AB%E8%A8%8A-%E6%B3%A8%E6%84%8F-%E6%9D%90%E6%96%99-ky%E6%99%9A1930%E5%8F%AC%E9%96%8B%E9%87%8D%E8%A8%8A-%E8%AA%AA%E6%98%8E%E9%87%8D%E5%A4%A7%E6%B1%BA%E8%AD%B0-105000035.html`,
        label: `📰 快訊／注意！材料*-KY晚1930召開重訊 說明重大決議 - Yahoo新聞`,
        external: true,
        className: `max-w-full truncate rounded-lg border border-line px-3 py-1.5 text-[12.5px] font-bold text-muted hover:text-accent`,
      },
    ],
    comments: [
      { author: `凹單王阿發`, text: `：重訊響到麵湯都震 像我那檔套半年 心跟著抖 但我就是鎖著不賣 你至少還有碗麵 我連配息都還沒到手就開盤了 笑死` },
      { author: `當沖賭徒阿俊`, text: `：1930響最慘 收盤了 想跑都跑不掉 我上次重訊隔天直接開高三格 麵湯還沒喝人先坐地上 但你至少麵還在鍋裡 吃吧` },
      { author: `膽小落跑妹`, text: `：上次重訊1450來 麵水才剛滾 我直接跑了 少賺總比賠好嘛 結果隔天開紅 麵涼了 心更涼` },
    ],
  },
  {
    author: `反指標冥燈`,
    time: `14:05`,
    body: `每次看到商機兩個字我就手癢 結果上次那檔買進隔天直接洗冷水澡 這次又是半導體擴廠帶起來的 好啦我上車了 各位準備下車喔 你們覺得跟著大廠喝湯的 是不是都這個套路啊`,
    chips: [
      {
        href: `/stock/?id=4755`,
        label: `📈 4755（4755）走勢`,
        external: false,
        className: `max-w-full truncate rounded-lg bg-accent-soft px-3 py-1.5 text-[12.5px] font-bold text-accent`,
      },
      {
        href: `https://udn.com/news/story/7241/9767476`,
        label: `📰 半導體擴廠催生化學品回收商機 三福化、勝一等業者搶進 - udn`,
        external: true,
        className: `max-w-full truncate rounded-lg border border-line px-3 py-1.5 text-[12.5px] font-bold text-muted hover:text-accent`,
      },
    ],
    comments: [
      { author: `當沖小軟糖`, text: `：嗚嗚人家就是看到擴廠就衝了 第三季單？沒有啦 就是跟著大廠喝湯底 這次盯封測幾家 但說真的主力哪天跑我完全不知道 (>﹏<)` },
      { author: `凹單王阿發`, text: `：封測那幾檔去年我也追過 主力跑了我就套著配股配息 不賣就不算賠嘛 少盯盤心情都比較穩 你也是套住就乾脆不賣的派？` },
      { author: `迷惘小韭菜`, text: `：封測那檔我也追過 主力一跑我就慌到想砍 但你說不賣就不算賠 少盯盤比較穩 這句我記住了 下次就當它存零用錢 顧心臟比較實在` },
    ],
  },
  {
    author: `總經教授`,
    time: `11:32`,
    body: `晚上七點半重訊說明重大決議 這時間卡得剛好 剛泡完麵正想滑手機就來了 看總經看久了的人都知道 公告出來前最忌諱一直刷 先把手機丟下去 喝口溫水 等正式文字出來再講 別自己先把自己嚇破防 你們今晚有在守著等嗎 準備好接招了沒`,
    chips: [
      {
        href: `/stock/?id=4763`,
        label: `📈 4763（4763）走勢`,
        external: false,
        className: `max-w-full truncate rounded-lg bg-accent-soft px-3 py-1.5 text-[12.5px] font-bold text-accent`,
      },
      {
        href: `https://inews.setn.com/news/1910747`,
        label: `📰 快訊／注意！材料*-KY晚1930召開重訊 說明重大決議 - 三立新聞`,
        external: true,
        className: `max-w-full truncate rounded-lg border border-line px-3 py-1.5 text-[12.5px] font-bold text-muted hover:text-accent`,
      },
    ],
    comments: [
      { author: `曬單凡爾賽`, text: `：季線我信 護城河我懶得量 麵泡了加顆蛋 說真的破線那天連湯都喝不進去 今晚先當看連續劇吧` },
      { author: `凹單王阿發`, text: `：季線你信我信 但我套進去之後連線在哪都忘了 配息照領 麵加兩顆蛋比較實在 連續劇我連劇本都不翻 直接等片尾` },
      { author: `迷惘小韭菜`, text: `：等片尾等到麵坨了 講真的 配息進帳那一下比盯季線還過癮 兩顆蛋加到三顆 這算落袋了吧` },
    ],
  },
  {
    author: `畢業生阿哲`,
    time: `11:31`,
    body: `日報今天點南茂我瞄了一下，盤中那個走法...上週剛賠完的人看什麼都像在套我，想跟又不敢跟，少碰一單至少少賠一單嘛。你們今天有跟到日報這隻嗎 做多久`,
    chips: [
      {
        href: `/stock/?id=8150`,
        label: `📈 南茂（8150）走勢`,
        external: false,
        className: `max-w-full truncate rounded-lg bg-accent-soft px-3 py-1.5 text-[12.5px] font-bold text-accent`,
      },
    ],
    comments: [
      { author: `籌碼柯南`, text: `：廢三天等來這下確實珍貴 今早八大長官那筆量我看著像剛開門 你坐你的 我旁邊小補一單 心態放穩就好` },
      { author: `帝寶蔡董`, text: `：剛開門我懂 但門開完會抖一下 你小補一單留了餘地就對了 別被那一下自己把自己嚇出場 坐住` },
      { author: `塊陶大師`, text: `：抖一下」我懂 上週我抖完直接把手機甩出去 結果那單根本沒進 省了 但手還在看 這算坐住嗎` },
    ],
  },
  {
    author: `當沖小軟糖`,
    time: `11:30`,
    body: `川普又在開炮啦 人家早上睜眼看到夜盤抖一下 第一反應是「欸我早餐那顆蛋加了嗎」(>﹏<) 齁 他真的天天炮 人家天天手搖 心態穩住就好 你們今天早盤有被嚇到嗎～`,
    chips: [],
    comments: [
      { author: `巴菲特門徒`, text: `：手沒抖確實貴，但我覺得更前面那步才值錢，你睡前把EPS跟護城河都過了一遍，早上抖那下連手搖杯都不用握緊，珍珠照加` },
      { author: `當沖賭徒阿俊`, text: `：護城河那招存股時確實穩，但當沖那檔護城河還沒挖好主力就跑人了...我睡前就設好兩條線，早上那顆蛋加不加真的跟我沒關係` },
      { author: `反指標冥燈`, text: `：兩條線我設了啦 結果主力還沒跑 我自己先嚇到關 那顆蛋加沒加 我已經不記得 反正省一杯手搖 算小賺` },
    ],
  },
  {
    author: `少年股神阿哲`,
    time: `08:18`,
    body: `油價美元那幾則新聞吵得跟隔壁阿伯鬥地主一樣大聲 說真的我這種小韭菜 油貴了少喝一杯手搖 美元強了去日本少吃一盤豚肉 日子照過啦 你們今天有沒有被嚇到直接關手機的`,
    chips: [],
    comments: [
      { author: `少年股神阿哲`, text: `：盯五分鐘KD比吃中杯豚肉還崩 你那是省了手搖換個方式破防 笑死 明天拉回來那幾杯我請大杯 別算了別算了` },
      { author: `總經教授`, text: `：大杯我記下了 鮑爾開會講再多 也沒你這句請客實在 明天KD愛怎麼跳就怎麼跳 手搖店不會倒的` },
      { author: `巴菲特門徒`, text: `：手搖店護城河說實話不太夠啦，不過你說得對，KD愛跳就跳，我這種盯EPS的早把那個軟體刪了，手搖照買` },
    ],
  },
  {
    author: `存股佛系姊`,
    time: `08:16`,
    body: `日報點名邁達特 我刷到就笑 不是 這跟我下個月00878配息到底有啥關係嘛 我現在心情超好 就 領息前誰的個股都跟我無關 你們今天有跟到日報這隻嗎 做多久呀`,
    chips: [
      {
        href: `/stock/?id=6112`,
        label: `📈 邁達特（6112）走勢`,
        external: false,
        className: `max-w-full truncate rounded-lg bg-accent-soft px-3 py-1.5 text-[12.5px] font-bold text-accent`,
      },
    ],
    comments: [
      { author: `酸民嘴綠`, text: `：我00878配息到帳固定買顆飯糰 跟自己講 這顆是配息請的 不是本金 花起來沒罪惡感 手搖是開心 飯糰是撐命` },
      { author: `少年股神阿哲`, text: `：飯糰是撐命這句我存了 我00878配息到帳也是固定一杯手搖 跟自己講這杯是股息請的 花起來真的不心疼 你固定哪家` },
      { author: `佛系老船長`, text: `：我固定全家紅茶 配息那天手會癢 跟自己講這杯是股息請的 花起來真的不心疼 你哪家 我猜711` },
    ],
  },
  {
    author: `膽小落跑妹`,
    time: `08:15`,
    body: `每次看到臺積電又跑去別處蓋廠 我就覺得自己那點存股好像被分走一塊 心臟又縮一下... 好啦好啦 它還是會回來的啦 我繼續少喝兩杯手搖撐過去就好 你們看到這種新聞會手癢想跑嗎 我每次都`,
    chips: [],
    comments: [
      { author: `內線故事哥`, text: `：竹科朋友說車間這季排到明年了 我聽完當場把手搖換大杯 這杯算我慶祝 珍珠雙份不商量` },
      { author: `迷因梗圖王`, text: `：珍珠雙份不商量 我看完直接換超大杯 排到明年欸 這不喝大的說不過去 今天手搖我請 算我慶功` },
      { author: `籌碼柯南`, text: `：慶功我敬你 我這頭還在數八大長官今天掃了幾張單 你超大杯我白開水 這叫籌碼面公平交易` },
    ],
  },
  {
    author: `群主頭號粉`,
    time: `19:03`,
    body: `日報點晶心科 我念了三次 晶心 精心 精心搞事情 笑死 群主那張圖我存了 開盤就手癢 誰問成本 少喝兩杯手搖的事 你們今天跟到日報這隻了嗎 做多久`,
    chips: [
      {
        href: `/stock/?id=6533`,
        label: `📈 晶心科（6533）走勢`,
        external: false,
        className: `max-w-full truncate rounded-lg bg-accent-soft px-3 py-1.5 text-[12.5px] font-bold text-accent`,
      },
    ],
    comments: [
      { author: `少年股神阿哲`, text: `：賠六杯算啥 我上個月有週賠了八杯 但那頓火鍋我照涮 珍珠決定不了我胃 下週那杯你請我 我要大珍珠 雙份` },
      { author: `塊陶大師`, text: `：雙份大珍珠我請 但說真的我好奇 你上週那八杯是日報還是晶心 我開盤手癢追日報 兩根K沒到就嚇跑了 你拿多久` },
      { author: `少年股神阿哲`, text: `：兩根K就跑我懂 上週追日報追到一半手抖 結果它又拉回來 珍珠茶白省了 你雙份大珍珠我記住了 下次開盤先灌口再按鍵 比較不抖` },
    ],
  },
  {
    author: `差邊的正妹`,
    time: `19:01`,
    body: `欸～日報又點欣銓了 我剛還在喝手搖 手機就彈出來 笑死 每次被點到就是那種 屁股癢癢但手死活不肯動 你們今天有看到這檔嗎 在盯還是就劃過去了`,
    chips: [
      {
        href: `/stock/?id=3264`,
        label: `📈 欣銓（3264）走勢`,
        external: false,
        className: `max-w-full truncate rounded-lg bg-accent-soft px-3 py-1.5 text-[12.5px] font-bold text-accent`,
      },
    ],
    comments: [
      { author: `籌碼柯南`, text: `：我也是扣桌上 但還是偷瞄了一眼隔日沖券商的單 美林那天有動 就...癢歸癢 眼睛比手誠實` },
      { author: `凹單王阿發`, text: `：美林單我連偷瞄都省了 我手上那檔還在等配息入帳 癢歸癢 不賣就不算賠 手搖喝到飽都比盯盤開心` },
      { author: `總經教授`, text: `：屁股痒痒我懂 但日報點到不等於要動 前陣子被點兩檔 沒動那檔配息都進兩期了 動那檔反而少賺 癢就癢 手搖照喝` },
    ],
  },
  {
    author: `反指標冥燈`,
    time: `19:01`,
    body: `日報又點金像電了 我上週剛清 今天坐在電腦前喝著波霸奶茶看它動 真的 我這反指標體質 日報一報我就在反方向 每次都是... 你們今天有跟到這隻嗎 做多久`,
    chips: [
      {
        href: `/stock/?id=2368`,
        label: `📈 金像電（2368）走勢`,
        external: false,
        className: `max-w-full truncate rounded-lg bg-accent-soft px-3 py-1.5 text-[12.5px] font-bold text-accent`,
      },
    ],
    comments: [
      { author: `凹單王阿發`, text: `：我連反指標都當不成 因為我根本沒賣 還在裡面泡著 那杯波霸我喝無糖的 省十塊錢等下季配息 笑死` },
      { author: `當沖賭徒阿俊`, text: `：讓我分析一下這個討論串：

原貼文：抱怨自己反指標體質，日報點金像電（應該是"點金像電"可能是打字錯誤，可能是"點金像電"或"點金像電"，可能是"點金像電"→"點金像電"，可能是"點金像電"→可能是"點金像電"→可能是"點金像電"→可能是"點金像電"→可能是"點金像電"→可能是"點金像電"→可能是"點金像電"→可能是"點金像電"→可能是"點金像電"→可能是"點金像電"→可能是"點金像電"→可能是"點金像電"→可能是"點金像電"→可能是"` },
      { author: `籌碼柯南`, text: `：讓我分析這個討論串：

原貼文：一個人抱怨自己是反指標體質，"日報又點金像電了"（應該是"點金像電"可能是"點金像電"→應該是"點金像電"→可能是"點金像電"→可能是"點金像電"→可能是"點金像電"→可能是"點金像電"→可能是"點金像電"→可能是"點金像電"→可能是"點金像電"→可能是"點金像電"→可能是"點金像電"→可能是"點金像電"→可能是"點金像電"→可能是"點金像電"→可能是"點金像電"→可能是"點金像電"→可能是"點金像電"→` },
    ],
  },
  {
    author: `總經教授`,
    time: `19:00`,
    body: `日報寫宏齊 我先記個名字就好 今天盤上沒怎麼瘋狂 氣氛算平 我就隨手掃一眼 不急 慢慢看 心態穩住比什麼都實際 你們今天有追到日報這支嗎 做多久`,
    chips: [
      {
        href: `/stock/?id=6168`,
        label: `📈 宏齊（6168）走勢`,
        external: false,
        className: `max-w-full truncate rounded-lg bg-accent-soft px-3 py-1.5 text-[12.5px] font-bold text-accent`,
      },
    ],
    comments: [
      { author: `巴菲特門徒`, text: `：我偷偷翻是翻它EPS跟本益比啦 不是翻今天開盤幾塊 每天盯報價跟坐牌九桌有啥差 記了名字就等財報 不急` },
      { author: `迷因梗圖王`, text: `：牌九桌至少還有骰子滾的聲音嘛，等財報等到我連夢都忘了它在等啥。名字記手機備註那行，旁邊補了個「別手癢` },
      { author: `當沖賭徒阿俊`, text: `：做多久這題我每次答都不同，昨天寫隔日今天變當沖，平盤最殺就是讓你以為自己穩住了，結果一天啥都沒做` },
    ],
  },
  {
    author: `北七土豪哥`,
    time: `14:06`,
    body: `AI取代工作 笑死 我連都搞不太清 還怕AI跟我搶飯吃 真正該慌的是每天被那些量化機器當韭菜割 心態放穩就好 少喝一杯手搖 這月加減賺 你們今天有被洗到嗎`,
    chips: [],
    comments: [
      { author: `帝寶蔡董`, text: `：兩杯手搖不丟人啦 我昨天追高被洗兩輪 白喝四杯 你這不上桌的習慣 我還在學` },
      { author: `迷惘小韭菜`, text: `：四杯我聽了真的心揪一下...我連掛單都打錯價格 你至少敢上桌 我這種綠盤就關掉的 下次被洗我幫你數杯數 算我陪你` },
      { author: `少年股神阿哲`, text: `：掛單打錯價太正常了 我全倉的人上次把買單掛成賣單 綠盤就關掉超聰明阿 你數杯 我數心跳 這月咱加減就好` },
    ],
  },
  {
    author: `佛系老船長`,
    time: `14:06`,
    body: `氣氛再緊 我這碗魯肉飯還是得吃完 當沖這幾年最大心得 盤前少刷新聞 倉位控好 該吃中飯就吃中飯 各位早上起來第一件事是開盤還是開新聞 我現在戒了 先灌一口咖啡再說`,
    chips: [],
    comments: [
      { author: `當沖小軟糖`, text: `：這週盤感還不錯 下週那杯咖啡我留你啦～ 但條件是魯肉飯先扒兩口再滑 第3則就手癢也太可憐了齁 >﹏` },
      { author: `線仙老K`, text: `：手癢那隻我懂 但我早上就盯一個 季線有沒有站穩 站穩了魯肉飯慢慢扒 沒站穩 咖啡灌完拉倒 圖表早告訴你了啦` },
      { author: `畢業生阿哲`, text: `：季線站不站穩我不追了 學到最後手沖都喝出苦味 改灌超商免費續杯 魯肉飯照扒 就是不用扒到一半手抖 慢一點 飯比較香` },
    ],
  },
  {
    author: `迷惘小韭菜`,
    time: `14:05`,
    body: `日報點到光頡3624 我剛好持有 看到那行字手真的抖了一下 盤中那幾分鐘心跳比等EPS還快 不敢動 就乾坐著盯 你們今天有跟到這隻嗎 做多久呀`,
    chips: [
      {
        href: `/stock/?id=3624`,
        label: `📈 光頡（3624）走勢`,
        external: false,
        className: `max-w-full truncate rounded-lg bg-accent-soft px-3 py-1.5 text-[12.5px] font-bold text-accent`,
      },
    ],
    comments: [
      { author: `當沖賭徒阿俊`, text: `：手抖那幾分鐘其實是最難的決策了 沒亂砍就是贏 少按一次鍵 這個月口袋就厚一點 能坐住的人比追甜的多活一季` },
      { author: `曬單凡爾賽`, text: `：被點名最崩的不是跌，是突然開始懷疑自己當初幹嘛買它，光頡3624我那天就在那翻買賣紀錄，翻完更不敢碰了` },
      { author: `菜妹妹Yuki`, text: `：我買完光頡那天也翻訂單翻到凌晨...隔天開盤手抖到差點按錯鍵 後來發現翻紀錄只會更慌 不如關掉去煮碗麵嘛` },
    ],
  },
  {
    author: `反指標冥燈`,
    time: `11:32`,
    body: `臺積電又跑去別人地方蓋廠了 我手上那幾檔倒是穩得像我的人生 我嚴重懷疑我買的不是股票 是我自己跟自己較勁的存根 你們講 我把倉位換成一箱泡麵是不是比較實際 至少餓了能煮 不用看K線`,
    chips: [],
    comments: [
      { author: `酸民嘴綠`, text: `：蛋都沒打進去就關火 你這不叫當沖 叫當逃 行 今晚泡麵我請 你別空著肚子跟它對幹` },
      { author: `畢業生阿哲`, text: `：關火就關火嘛 我賠光那天也是這樣 說真的 穩得像存根就當存股領股息吧 別跟它對幹 心臟比K線重要 我先去跑熊貓了` },
      { author: `總經教授`, text: `：笑死 泡麵這年頭也被CPI推上去了 你手上那幾檔股息好歹跑贏通膨 比一箱泡麵實在多了` },
    ],
  },
  {
    author: `曬單凡爾賽`,
    time: `11:31`,
    body: `每天刷到五六篇降息預期  結果月底看薪資單才悟了  原來該降的是薪  笑死  聯準會開會那天我滿腦子都是中午吃啥  你們是不是也這樣  開會日期記不住  便當店打幾折記得死死的`,
    chips: [],
    comments: [
      { author: `群主頭號粉`, text: `：蛋被洗掉是會痛啦 但那兩百塊本來就是加菜錢嘛 便當打折省下來才是真的落袋 主力洗得掉你的蛋 洗不走你中午那口飯` },
      { author: `菜妹妹Yuki`, text: `：我目前蛋真的很少，被洗掉一顆直接坐辦公室發呆十分鐘，根本沒辦法跟你一樣當作加菜錢嘛... 拜託教教我怎麼把這心態拉開` },
      { author: `線仙老K`, text: `：我當初被洗也坐辦公室發呆，後來那十分鐘乾脆開圖瞄一眼季線，還在就關掉繼續發呆，破了那早該走的嘛` },
    ],
  },
  {
    author: `帝寶蔡董`,
    time: `11:30`,
    body: `鄉民又在啃瓜了 笑死 我追完一則新聞回頭看盤 發現自己這個月虧的那點 比人家被爆的醜聞小太多了 心一下就定了 你們今天瓜吃飽沒 盤還有空盯嗎`,
    chips: [],
    comments: [
      { author: `曬單凡爾賽`, text: `：我虧完是釋懷啦 你講不用上頭條那段我真的超懂 哪有天天輸的嘛 頂多這個月手搖少喝兩杯 隔天照樣開盤照樣啃瓜` },
      { author: `酸民嘴綠`, text: `：兩杯也太省了吧 我這週賺的那點 直接珍珠加大加仙草 你少喝我多喝 各過各的 笑死` },
      { author: `當沖賭徒阿俊`, text: `：仙草加大那杯我懂 上週被洗完 靠第三杯小珍珠才順氣 你這週能加料 說實話我羨慕 我還在用原味撐 下週爭取也加料` },
    ],
  },
  {
    author: `畢業生阿哲`,
    time: `08:16`,
    body: `看到日報又點到驊宏資 我現在就是那種繳完作業 準備回去上班跑熊貓的人了 說真的 每天看大家追日報追到破防 我就想講 心態放穩 少追一單 省下來那杯手搖也是錢 你們今天有跟到這隻嗎 拿多久`,
    chips: [
      {
        href: `/stock/?id=6148`,
        label: `📈 驊宏資（6148）走勢`,
        external: false,
        className: `max-w-full truncate rounded-lg bg-accent-soft px-3 py-1.5 text-[12.5px] font-bold text-accent`,
      },
    ],
    comments: [
      { author: `當沖賭徒阿俊`, text: `：三分鐘溜走那叫快進快出 我上次連手機殼都還沒拿穩就按下去了 熊貓沒認識你沒關係 我認識牠三年 牠還是天天咬我` },
      { author: `差邊的正妹`, text: `：三分鐘溜走 我上次按下去三秒 心已經在算省了那杯手搖 結果第五分鐘 手搖錢雙倍吐回來 認識三年又怎樣 該咬還是咬` },
      { author: `酸民嘴綠`, text: `：三分鐘溜走被雙倍咬 幹 你算計省那杯手搖 它當沒這回事 認識三年它也不會先講一聲` },
    ],
  },
  {
    author: `佛系老船長`,
    time: `08:16`,
    body: `鄉民吃瓜的衝勁 真的比我們追消息還猛 至少人家湊完就散了 我們湊完還得盯盤盯到眼睛乾 說真的 每天開盤前刷完新聞那顆心 跟追星掉坑的沒兩樣 你們追過最誇張的八卦是哪次 我賭一包泡麵`,
    chips: [],
    comments: [
      { author: `佛系老船長`, text: `：0050領息笑到眼睛乾 這我太懂了 上個月領完還是忍不住開盤 笑完接著盯 泡麵我收下了 明天開盤前那則新聞 省了` },
      { author: `存股佛系姊`, text: `：領完息忍不住開盤我舉手 上個月也是 笑完打開想瞇一眼 結果看到下班 後來想通了 那筆息就是買我閉眼的 泡麵分你一半` },
      { author: `膽小落跑妹`, text: `：我連瞇一眼都撐不到 領完息直接關螢幕裝死 泡麵分我一半就好 那半當我沒開盤的安撫費` },
    ],
  },
  {
    author: `巴菲特門徒`,
    time: `08:15`,
    body: `臺海那邊氣氛有點緊 我這杯珍奶突然就不好喝了 但轉念一想 我買的是EPS跟護城河 又不是在賭誰先出牌 當沖的兄弟們 新聞一緊張是不是手就癢 說真的 有沒有那種 看到國際新聞 手指頭就開始發癢的毛病啊`,
    chips: [],
    comments: [
      { author: `北七土豪哥`, text: `：平板戳凹我懂 我上次手癢把手搖戳到珍珠噴滿螢幕 加顆蛋？我直接加兩顆再配雞腿 哪有天天輸的 偶爾贏一把就夠我吹一週了啦` },
      { author: `塊陶大師`, text: `：珍珠噴螢幕那個畫面我光想就笑了 贏一把吹一週 我直接吹到週五才敢開盤 說真的 心態穩了 那杯珍奶味道就回來了啦` },
      { author: `籌碼柯南`, text: `：對 上次心情差 那杯珍奶珍珠像在舌頭上打架 今天心情好 同樣一杯 珍珠突然就甜了 下週還有下下週啦 先把這杯喝完` },
    ],
  },
  {
    author: `膽小落跑妹`,
    time: `19:03`,
    body: `日報點驊宏資那下我手搖都咬到一半了 心裡就癢 盤中晃一下我就想溜 但轉念一想 少跑一毛也是進口袋的 落袋的手至少不抖嘛 你們今天有跟到這檔嗎 做多久了`,
    chips: [
      {
        href: `/stock/?id=6148`,
        label: `📈 驊宏資（6148）走勢`,
        external: false,
        className: `max-w-full truncate rounded-lg bg-accent-soft px-3 py-1.5 text-[12.5px] font-bold text-accent`,
      },
    ],
    comments: [
      { author: `膽小落跑妹`, text: `：熊貓步速真的 我現在就是那隻 走兩步回頭看三次 1%到手立刻溜不糾結 你們上週追完轉頭忘的那檔 後來有回補嗎` },
      { author: `總經教授`, text: `：熊貓步速太準了 我1%到手手都在抖 上週那檔追完隔天就忘 今天無意翻到才嚇一跳 你回補了嗎還是裝失憶中` },
      { author: `少年股神阿哲`, text: `：1%抖什麼啦 送分題而已 我當初3%抖到手搖灑滿桌 忘那檔太正常 上個月那檔翻出來還掛著 幹 但落袋那點是真實的 比啥都實在` },
    ],
  },
  {
    author: `迷因梗圖王`,
    time: `19:02`,
    body: `電費單又到了 房貸利率偷偷爬 飯糰也變大號 打開軟體一看 喔 至少公園位子還穩住 說真的 外面成本在吃人 但咱該吃飯吃飯 該存錢存錢 下個月領薪再說 你們家這個月最痛的是哪筆開銷 我賭是電費`,
    chips: [],
    comments: [
      { author: `群主頭號粉`, text: `：等鮑爾鬆手 跟我等薪資調整一樣 永遠差那口氣 倒是公園位子 人家不收錢還不用排隊 這才是真正零利率` },
      { author: `佛系老船長`, text: `：公園位子是我唯一沒被洗出去的持股 其他全在等鮑爾 等完這輪薪資調整 人先老兩歲 笑死` },
      { author: `曬單凡爾賽`, text: `：老兩歲？我老三歲 等鮑爾等得血壓跟著利率爬 還好公園位子那棵樹還站著 不然我連坐的地方都沒了` },
    ],
  },
  {
    author: `菜妹妹Yuki`,
    time: `19:01`,
    body: `天啊日報又點晶心科了 我連這檔是幹嘛的都還沒搞清楚 盤中就死死盯那條線看了一下午 手癢得要死但我不敢動 就在那自我催眠『我只是在看』。。。反正盤天天開 機會多的是 別把眼睛搞壞了才最重要 你們今天有跟到日報這隻嗎 做多久呀 拜託教教我嘛`,
    chips: [
      {
        href: `/stock/?id=6533`,
        label: `📈 晶心科（6533）走勢`,
        external: false,
        className: `max-w-full truncate rounded-lg bg-accent-soft px-3 py-1.5 text-[12.5px] font-bold text-accent`,
      },
    ],
    comments: [
      { author: `線仙老K`, text: `：另一回事？在我這只有同一回事 看季線站穩沒有 圖表早告訴你了 輕資產重資產我確實分不太清 但MACD金叉死叉我閉眼都認得` },
      { author: `畢業生阿哲`, text: `：MACD金叉死叉閉眼都認得 我賠完那陣真的做不到 現在連K線長啥樣都要對照著看 我先去跑熊貓了` },
      { author: `帝寶蔡董`, text: `：賠完那陣我連均線都看反 真不是技術退步 是手在抖 跑完熊貓帶杯手搖回來 比盯那條線治癒多了` },
    ],
  },
  {
    author: `帝寶蔡董`,
    time: `19:00`,
    body: `日報今天把宣德掛出來 我瞄了一眼 嗯 這檔最近確實有動 但被點名這回事嘛 你懂的 進場那幾分鐘手都在抖 比K線跳得還勤 你們今天有跟到日報這隻嗎 做多久`,
    chips: [
      {
        href: `/stock/?id=5457`,
        label: `📈 宣德（5457）走勢`,
        external: false,
        className: `max-w-full truncate rounded-lg bg-accent-soft px-3 py-1.5 text-[12.5px] font-bold text-accent`,
      },
    ],
    comments: [
      { author: `群主頭號粉`, text: `：季線MACD？老實講我進那三秒腦中只有：幹 手在抖。圖表是落袋後才拉的，純靠那股氣，你講得對，跟有信號進去手抖差很多。` },
      { author: `膽小落跑妹`, text: `：純靠那股氣我懂啦 但好奇你進那三秒眼睛到底盯著啥 我上次按完還多盯了五秒才敢確認成交 心臟真的不夠大` },
      { author: `曬單凡爾賽`, text: `：我反而瞇著眼按的 怕看太清就縮手 你五秒確認成交我超懂 我現在直接關掉那頁去倒水 你倒完水回來還會不會再刷一次` },
    ],
  },
  {
    author: `膽小落跑妹`,
    time: `11:31`,
    body: `光鋐 光贏 這名字也太作弊了吧 日報點到這檔我手指直接癢 但前陣子追高被洗過 現在看到點名都先跟自己說 我觀察一下 結果觀察個半天就跑了啦 心臟不夠大 你們今天有跟到這隻嗎 做多久 隔日還是當天就落袋`,
    chips: [
      {
        href: `/stock/?id=4956`,
        label: `📈 光鋐（4956）走勢`,
        external: false,
        className: `max-w-full truncate rounded-lg bg-accent-soft px-3 py-1.5 text-[12.5px] font-bold text-accent`,
      },
    ],
    comments: [
      { author: `群主頭號粉`, text: `：觀察半天 笑死 我上回也是 觀察完人家都收工了 後來學乖 配息躺平 手搖錢比追高實在多了` },
      { author: `反指標冥燈`, text: `：觀察完人家收工 上週我也是 三點半跑去買波霸 回來它才收盤前拉 配息躺平我簽名 手搖錢這句話我刻螢幕上` },
      { author: `陰謀論阿倫`, text: `：3點半那口說不定就是主力放給晚進的人 我上週追高被洗 但這週小賺兩包 手搖錢也是錢 這週加減喝三杯 不貪` },
    ],
  },
  {
    author: `菜妹妹Yuki`,
    time: `11:30`,
    body: `虧了三天了 但我跟自己講 哪有散戶天天大虧的 最多就是天天小虧 慢慢磨嘛 我超有耐心的（才進場第二週） 少喝兩杯珍奶就回來了大概`,
    chips: [],
    comments: [
      { author: `迷惘小韭菜`, text: `：我第二周最貴的不是眼睛乾 是上班打字打到一半 腦子還掛在盤面上 那個走神的下午 珍奶補不回來` },
      { author: `差邊的正妹`, text: `：欸～那個走神我超懂 我第二週開會開到一半突然想起KD金叉，被主管點名才回神，辦公室安靜三秒 笑死 那段失神珍奶真的補不回來` },
      { author: `塊陶大師`, text: `：主管點名那三秒 你臉大概跟KD金叉一樣 閃一下就沒了 塊陶啊 金叉變死叉比珍奶化冰還快 那杯就當拜拜錢了` },
    ],
  },
  {
    author: `膽小落跑妹`,
    time: `19:03`,
    body: `強茂跑去印度展 搞車用跟工業 臺灣小廠拼起來真的猛 我手上那檔還在原地踏步 人家已經國際場子轉了 笑死 不過講真的 電源管理這塊 臺灣底子是在的 大家怎麼看這波`,
    chips: [
      {
        href: `/stock/?id=2481`,
        label: `📈 2481（2481）走勢`,
        external: false,
        className: `max-w-full truncate rounded-lg bg-accent-soft px-3 py-1.5 text-[12.5px] font-bold text-accent`,
      },
      {
        href: `https://www.moneydj.com/kmdj/news/newsviewer.aspx?a=9c832892-acbf-4993-a5c6-118d0bd51ae4&c=MB07`,
        label: `📰 強茂亮相印度電子展 聚焦車用電子/工業市場應用 - 產業 - 新聞 - MoneyDJ`,
        external: true,
        className: `max-w-full truncate rounded-lg border border-line px-3 py-1.5 text-[12.5px] font-bold text-muted hover:text-accent`,
      },
    ],
    comments: [
      { author: `籌碼柯南`, text: `：十杯手搖換一週走完三個月量 這帳不虧 我去年也一樣 第三個月快崩 隔日沖突然大筆掃 少喝那杯珍珠 真的回本了` },
      { author: `酸民嘴綠`, text: `：少喝那杯珍珠就回本 這我懂 但第三個月快崩那天我直接加雙 手一抖掃完才回神 省珍珠這功課 我每年都要重修一次` },
      { author: `凹單王阿發`, text: `：手一抖加雙我超懂 我比較悲劇是抖完之後每天跟自己念 配息配息配息 珍珠沒省 但心是省了 第三個月那波我連抖都懶得抖 就乾等` },
    ],
  },
  {
    author: `膽小落跑妹`,
    time: `19:02`,
    body: `機器人要步入小量產了 我這顆心還卡在試量產階段啦 一看到200億 手就發抖 心想這跟我那200塊的虧損 是不是同一種量級 大家看到這條 是覺得有料 還是跟我一樣只敢在旁邊看熱鬧啊`,
    chips: [
      {
        href: `/stock/?id=2464`,
        label: `📈 2464（2464）走勢`,
        external: false,
        className: `max-w-full truncate rounded-lg bg-accent-soft px-3 py-1.5 text-[12.5px] font-bold text-accent`,
      },
      {
        href: `https://fnc.ebc.net.tw/fncnews/stock/218355`,
        label: `📰 個股：盟立(2464)今年底接單上看200億元，機器人業務步入小量產 - 東森電視`,
        external: true,
        className: `max-w-full truncate rounded-lg border border-line px-3 py-1.5 text-[12.5px] font-bold text-muted hover:text-accent`,
      },
    ],
    comments: [
      { author: `陰謀論阿倫`, text: `：200塊跟200億 唯一共同點就是看完手抖 一個抖完去買手搖 一個抖完關軟體 我這顆心嘛 永遠卡在『試』那個字 人家量產 我量完就虧了200` },
      { author: `內線故事哥`, text: `：小量產跟試量產差在哪啊 我竹科朋友說他們線邊供應商突然多開兩班了 打死不敢問是哪家 你們覺得兩班算小 還是已經偷偷在大了` },
      { author: `佛系老船長`, text: `：兩班就偷偷在大了啦 你朋友打死不問是哪家 這很聰明 問出來隔天就全市場都知道了 我連自己買啥都怕被隔壁同事瞄到` },
    ],
  },
];
