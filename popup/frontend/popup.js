let settings = {
    packedOnly: false,
};

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

const paycoInnerScript = () => {
    let POPUP = {
        init: function () {
            this.popup = document.querySelectorAll('.popup_select');
            this.popupOpener = document.querySelectorAll('.btn_select');
            this.popupCloser = document.querySelectorAll('.btn_confirm');
            this.svcYmdFilter = document.querySelectorAll(".btnSelSvcYmd");
            this.menuTypeFilter = document.querySelectorAll(".btnSelType");
            this.menuData = document.getElementById("dataResult");
            this.dim = document.querySelector('.dimmed2');
            this.bindEvents();

            document.querySelector(".text_notice").remove();
            document.querySelector("[data-popupid='menuTpPop']").remove();
        },
        bindEvents: function () {
            let _self = this;
            this.popupOpener.forEach(opener => {
                opener.addEventListener('click', function (e) {
                    let target = e.currentTarget;
                    _self.dim.style.display = 'block';
                    document.getElementById(target.getAttribute('data-popupId')).style.display = 'block';
                });
            });
            this.popupCloser.forEach(closer => {
                closer.addEventListener('click', function () {
                    _self.popupHide();
                });
            });
            this.svcYmdFilter.forEach(filter => {
                filter.addEventListener('click', function (e) {
                    let currentTarget = e.currentTarget;
                    _self.selectOption(currentTarget);
                    document.getElementById("svcYmdTxt").textContent = currentTarget.textContent;
                    _self.loadMenuData();
                    _self.popupHide();
                });
            });
            this.menuTypeFilter.forEach(filter => {
                filter.addEventListener('click', function (e) {
                    let currentTarget = e.currentTarget;
                    _self.selectOption(currentTarget);
                    document.getElementById("menuTypeTxt").textContent = currentTarget.textContent;
                    _self.loadMenuData();
                    _self.popupHide();
                });
            });
            _self.loadMenuData();
        },

        popupHide: function () {
            let _self = this;
            _self.dim.style.display = 'none';
            _self.popup.forEach(p => p.style.display = 'none');
        },
        selectOption: function (currentTarget) {
            let selected = currentTarget.closest(".list_option").querySelectorAll("li.item_option");
            selected.forEach(item => {
                item.classList.remove("is-selected");
                item.querySelector("button").removeAttribute("data-selected");
            });

            currentTarget.setAttribute("data-selected", "selected");
            currentTarget.closest("li.item_option").classList.add("is-selected");
        },
        rebindCatgSelectEvent: function () {
            let catgBoxes = document.querySelectorAll(".catgBox");
            catgBoxes.forEach(box => {
                box.removeEventListener('change', this.catgBoxChangeHandler);
                box.addEventListener('click', this.catgBoxChangeHandler);
            });
        },
        catgBoxChangeHandler: function () {
            document.querySelectorAll(".timeView").forEach(view => view.style.display = 'none');
            let key = this.value;
            if (key === 'ALL') {
                document.querySelectorAll(".timeView").forEach(view => view.style.display = 'block');
            } else {
                document.querySelectorAll('.timeView_' + key).forEach(view => view.style.display = 'block');
            }
        },
        getSelectedElement: function (target) {
            return Array.from(target).find(el => el.getAttribute('data-selected') === 'selected');
        },
        loadMenuData: function () {
            let _self = this;
            let shopMenuCfgSeq = document.getElementById("shopMenuCfgSeq").value;
            let serviceYmd = _self.getSelectedElement(_self.svcYmdFilter).getAttribute('data-value');
            let shopMenuTypeSeq = _self.getSelectedElement(_self.menuTypeFilter).getAttribute('data-value');
            let url = "https://menu.payco.com/service/shopMenu/menuList.nhn?shopMenuCfgSeq=" + shopMenuCfgSeq + "&serviceYmd=" + serviceYmd;
            if (shopMenuTypeSeq) {
                url += '&shopMenuTypeSeq=' + shopMenuTypeSeq;
            }
            fetch(url)
                .catch(() => {
                    alert('PAYCO 서비스 연결이 원활하지 않습니다.\n잠시 후 다시 이용해주세요.');
                })
                .then(response => response.text())
                .then(result => {
                    _self.render(result);
                    let view = _self.menuData?.querySelector("div[class^='typeView_'");
                    if (view) {
                        view.style.display = 'block';
                    }
                    _self.menuData.querySelectorAll('.menu_info_box .list_tag').forEach(tag => tag.remove());
                    _self.menuData.style.paddingBottom = '0';
                    _self.rebindCatgSelectEvent();
                });
        },
        render(data) {
            let _self = this;
            if (!data) {
                _self.menuData.innerHTML = '데이터가 없습니다.';
            }
            _self.menuData.innerHTML = data;
            var menus = [];
            _self.menuData.querySelectorAll('.item_menu').forEach(item => {
                var title = denormalizeText(item.querySelector('strong.menu_title').innerHTML);
                var category = denormalizeText(item.querySelector('span.menu_category').innerHTML);
                if (category.includes("도시락") === settings.packedOnly) {
                    var isExist = false;
                    for (var i = 0; i < menus.length; i++) {
                        if (menus[i].title == title) {
                            menus[i].category += ", " + category.split(">")[1].trim();
                            isExist = true;
                            break;
                        }
                    }
                    if (isExist) {
                        item.remove();
                        return;
                    }
                    menus.push({
                        title: title,
                        category: category,
                        element: item,
                    });
                } else {
                    item.remove();
                }
            });
            for (var i = 0; i < menus.length; i++) {
                menus[i].element.querySelector('span.menu_category').textContent = menus[i].category;
            }
        }
    };
    let COUNTER = {
        init: function () {
            this.list = document.querySelector('.list_category');
            this.items = this.list?.querySelectorAll('.item_category') || [];
            this.currentLength = this.items.length;
        },
        addFunc: function () {
            let str = '<li class="item_category"><input type="radio" name="category" id="category' + this.currentLength + '" class="input"><label for="category' + this.currentLength + '" class="label">식단 분류</label>';
            this.list?.insertAdjacentHTML('beforeend', str);
            this.items = this.list?.querySelectorAll('.item_category') || [];
            this.currentLength++;
        },
        subtractFunc: function () {
            if (this.items.length > 0) {
                this.items[this.items.length - 1].remove();
            }
            this.items = this.list?.querySelectorAll('.item_category') || [];
            this.currentLength--;
        }
    };
    POPUP.init();
    COUNTER.init();
};

function loadPopup() {
    chrome.runtime.sendMessage({ action: "fetchPaycoMenu" }, function (response) {
        if (response && response.data) {
            document.getElementById("menuContent").innerHTML = response.data;
            paycoInnerScript();
        } else {
            document.getElementById("menuContent").innerHTML = "Failed to load menu.";
        }
    });
}

function buttonSetttings() {
    if (settings.doorayUrl === undefined || settings.doorayUrl === null || settings.doorayUrl === "") {
        console.log(settings.doorayUrl);
        document.getElementById("sendDoorayAlarm").style.cursor = "not-allowed";
        document.getElementById("sendDoorayAlarm").querySelector("path").setAttribute("fill", "#666");
    } else {
        document.getElementById("sendDoorayAlarm").addEventListener("click", function () {
            chrome.runtime.sendMessage({ action: "sendMenuToDoory" }, function (response) {
            });
        });
    }

    document.getElementById("openOptions").addEventListener("click", function () {
        if (chrome.runtime.openOptionsPage) {
            chrome.runtime.openOptionsPage();
        } else {
            window.open(chrome.runtime.getURL("options/frontend/index.html"));
        }
    });
}

window.onload = function () {
    chrome.runtime.sendMessage({ action: "getSettings" }, function (response) {
        if (response && response.data) {
            settings = response.data;
        }
        loadPopup();
        buttonSetttings();
    });
};
