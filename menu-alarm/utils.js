function denormalizeText(text) {
    if (!text) {
        return "";
    }

    return text
        .replace(/\s+/g, ' ')
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/\<br\>/g, "\n")
        .replace(/&quot;/g, "\"")
        .replace(/&#39;/g, "\'")
        .trim();
}

function getElement(item, eleNm, cls, attribute) {
    var regex = new RegExp('<' + eleNm + (cls ? ' class="' + cls + '"' : '') + '[^>]*>' + (attribute ? '' : '([\\s\\S]*?)') + (eleNm === 'img' ? '' : '<\\/' + eleNm + '>'), 'i');
    var match = item.match(regex);
    var result = "-";
    if (match) {
        if (attribute) {
            var attrRegex = new RegExp(attribute + '="([^"]*)"', 'i');
            var attrMatch = match[0].match(attrRegex);
            result = attrMatch ? attrMatch[1] : "-";
        } else {
            result = match[1];
        }
    }
    return denormalizeText(result);
}

function formatDate(date, format) {
    var year = date.getFullYear();
    var month = (date.getMonth() + 1).toString().padStart(2, '0');
    var day = date.getDate().toString().padStart(2, '0');
    return format.replace('yyyy', year).replace('MM', month).replace('dd', day);
}

export function sendDoorayAlarm() {
    var now = new Date();
    var ymd = formatDate(now, "yyyyMMdd");
    var type = now.getHours() < 14 ? "중식" : "석식";
    var colors = ['red', 'orange', 'yellow', "magenta", "tan", "olive", 'green', 'blue', 'navy', 'purple', 'grey', 'black'];
    var url = "https://menu.payco.com/service/shopMenu/menuList.nhn?shopMenuCfgSeq=29&serviceYmd=" + ymd;

    chrome.storage.local.get(['botName', 'textTemplate', 'doorayUrl', 'packedOnly'], function (result) {
        const { botName, textTemplate, doorayUrl, packedOnly } = result;

        if (!doorayUrl) {
            console.error("두레이 URL이 설정되어 있지 않습니다.");
            return;
        }

        fetch(url)
            .then(response => response.text())
            .then(data => {
                var menus = [];
                var regex = /<li class="item_menu[ a-zA-Z0-9_]*">([\s\S]*?)<\/li>/g;
                var match;
                var index = 0;

                while ((match = regex.exec(data)) !== null) {
                    var item = match[1];
                    var title = getElement(item, "strong", "menu_title");
                    var category = getElement(item, "span", "menu_category");
                    var imageUrl = getElement(item, "img", null, "src");
                    var description = getElement(item, "p", "menu_desc");
                    var calories = getElement(item, "span", "menu_cal");

                    if (category.includes(type) && category.includes("도시락") === packedOnly) {
                        var isExist = false;
                        for (var i = 0; i < menus.length; i++) {
                            if (menus[i].title === title) {
                                menus[i].authorName += ", " + category.split(">")[1].trim();
                                isExist = true;
                                break;
                            }
                        }
                        if (isExist) {
                            continue;
                        }
                        menus.push({
                            title: title,
                            authorName: category,
                            imageUrl: imageUrl,
                            text: description,
                            color: colors[index % colors.length],
                            calories: calories ?? "-"
                        });
                        index++;
                    }
                }
                // 타이틀 뒤에 칼로리 정보 추가
                menus = menus.map(function (menu) {
                    if (menu.calories !== "-") {
                        menu.title += " (" + menu.calories + ")";
                    }
                    delete menu.calories;
                    return menu;
                });

                if (menus.length === 0) {
                    return;
                }

                var payload = {
                    botName: botName,
                    botIconImage: "https://static.dooray.com/static_images/dooray-bot.png",
                    text: textTemplate.replace("{}", type),
                    attachments: menus
                };
                const postData = JSON.stringify(payload);
                fetch(doorayUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: postData
                })
                    .then(response => response.text())
                    .then(data => {
                        console.log(data);
                    })
                    .catch(error => {
                        console.error(`에러 발생: ${error}`);
                    });
            })
            .catch(error => {
                console.error(`에러 발생: ${error}`);
            });
    });
}
