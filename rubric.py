# 5C Role Play 評分細則（來源：RL_5C_RolePlay_Evaluation_Form 0609.xlsx）

OVERALL_FEELINGS = [
    "啟發理想生活的嚮往感",
    "賓至如歸的款待感",
    "毫不費力的優雅感",
    "被深刻理解的專屬感",
    "以上皆無",
]

CATEGORIES = [
    {
        "key": "CREATE",
        "name": "CREATE 創造",
        "subtitle": "歡迎・第一印象",
        "items": [
            {"id": "create_1", "max": 2, "text": "顧客進店 5–15 秒內主動、熱情迎接並打招呼 (Welcome)，如為老顧客主動喚起記憶點（如稱呼、上次購買或聊過的話題）"},
            {"id": "create_2", "max": 2, "text": "微笑、眼神接觸，運用開放肢體語言傳遞溫暖"},
            {"id": "create_3", "max": 2, "text": "儀容儀表符合品牌大使 (Brand Ambassador) 標準"},
            {"id": "create_4", "max": 3, "text": "主動向顧客自我介紹（報上名字）並詢問客人稱呼"},
            {"id": "create_5", "max": 3, "text": "請顧客逛店並介紹店內特色（藝術品／陳列／各區域）"},
        ],
    },
    {
        "key": "CONNECT",
        "name": "CONNECT 連結",
        "subtitle": "建立關係",
        "items": [
            {"id": "connect_1", "max": 3, "text": "敏銳觀察顧客和其同行者、穿著風格或提袋，使用問題自然破冰開啟對話。"},
            {"id": "connect_2", "max": 4, "text": "運用開放式問題 (Open Questions, 5W1H) 探索需求與夢想"},
            {"id": "connect_3", "max": 2, "text": "主動傾聽，對顧客分享的資訊給予回應 (Echo)"},
            {"id": "connect_4", "max": 4, "text": "適度分享自己，於個人層面建立連結與信任"},
            {"id": "connect_5", "max": 2, "text": "關注顧客舒適度（賜座、奉茶水、雨天接傘、安撫孩童）"},
            {"id": "connect_6", "max": 4, "text": "觀察並記錄顧客資訊，作為 Clienteling 依據"},
            {"id": "connect_7", "max": 3, "text": "暫離顧客時主動說明原因預計時間，佈置作業，再次自我介紹，回來後感謝等待。"},
        ],
    },
    {
        "key": "CONVERT",
        "name": "CONVERT 轉化",
        "subtitle": "創造渴望・成交",
        "items": [
            {"id": "convert_1", "max": 4, "text": "介紹產品特性，且與顧客需求相關"},
            {"id": "convert_2", "max": 4, "text": "運用故事分享法 (Story Sharing：元素＋精神＋共鳴) 達成情感聯結"},
            {"id": "convert_3", "max": 3, "text": "在門外預先備好其他尺寸或穿搭配件（如帽子皮帶和包等）。"},
            {"id": "convert_4", "max": 4, "text": "運用造夢法 (Dream Building：場景＋細節＋動作) 描繪理想生活畫面"},
            {"id": "convert_5", "max": 3, "text": "鼓勵顧客試穿／試背並觸摸產品"},
            {"id": "convert_6", "max": 3, "text": "陪同顧客至鏡前並協助試穿，提供整體搭配建議 (Total Look)"},
            {"id": "convert_7", "max": 4, "text": "進行交叉／追加／附加銷售，運用「三的法則」(Rule of Three) 不僅提供顧客挑選的單品，主動額外準備 2 件單品（搭配款或升級替代款）放入更衣室"},
            {"id": "convert_8", "max": 3, "text": "主動介紹並推薦任一高階產品，或帶往其他品類區"},
            {"id": "convert_9", "max": 2, "text": "遇到缺碼時，主動執行「交叉銷售 (Cross-selling)」提供替代方案"},
            {"id": "convert_10", "max": 3, "text": "主動提問了解異議並協助消除（確認→瞭解→回應）"},
            {"id": "convert_11", "max": 3, "text": "能適時打破刻板印象提供跨界建議（如推薦女性試穿男裝 Oversize）"},
            {"id": "convert_12", "max": 3, "text": "利用顧客試穿的空檔，在外場用 AI 快速生成視覺化穿搭提案（Total Look）或者利用 AI 進行膚色/臉型/版型/顏色推薦"},
            {"id": "convert_13", "max": 2, "text": "訪問期間使用數位工具（手機／iPad）與顧客互動"},
        ],
    },
    {
        "key": "CONFIRM",
        "name": "CONFIRM 確認",
        "subtitle": "結單・加值",
        "items": [
            {"id": "confirm_1", "max": 2, "text": "商品依 RL 標準包裝，並護送至收銀臺，在遞交給顧客前，1. 檢查瑕疵、2. 拔除防盜扣、3. 確認發票明細無誤"},
            {"id": "confirm_2", "max": 3, "text": "提及任一建議服務（修改、售後、商品洗滌合作店家、鞋保養等）"},
            {"id": "confirm_3", "max": 2, "text": "提及郵寄或官網到店取貨服務（for POLO）"},
            {"id": "confirm_4", "max": 3, "text": "主動採集／再確認顧客資料，並說明加 LINE OA 的原因好處，顧客不願意留聯絡方式遞送名片"},
        ],
    },
    {
        "key": "CONTINUE",
        "name": "CONTINUE 持續",
        "subtitle": "送別・回訪",
        "items": [
            {"id": "continue_1", "max": 2, "text": "創造難忘的 Peak-End 告別，並以名字向顧客致謝"},
            {"id": "continue_2", "max": 2, "text": "送客至店門口，過程保持與顧客交流"},
            {"id": "continue_3", "max": 3, "text": "針對高貢獻度客人，運用 AI 輔助生成「懂他生活」的專屬問候，且必須在重要節慶前主動聯絡"},
            {"id": "continue_4", "max": 3, "text": "給顧客清晰且有力的回店理由，Connect顧客接待時收集到客人的資訊（記憶點->期待值）"},
            {"id": "continue_5", "max": 2, "text": "提及預約到店選購，或官網／會員專屬好處，主動預告近期的活動與權益"},
            {"id": "continue_6", "max": 3, "text": "訪問尾聲告知將主動回訪，並約定回訪時機"},
        ],
    },
]

ITEM_INDEX = {item["id"]: (cat["key"], item) for cat in CATEGORIES for item in cat["items"]}

TOTAL_MAX_SCORE = sum(item["max"] for cat in CATEGORIES for item in cat["items"])


def grade_for(score):
    if score >= 90:
        return "優秀"
    if score >= 85:
        return "合格"
    return "待加強"
