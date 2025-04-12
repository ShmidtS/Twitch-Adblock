# Twitch Adblock Fix & Force Source Quality (with Monitoring)


**(RU)** Скрипт для блокировки рекламы на Twitch и автоматической установки максимального качества ("Источник").
**(EN)** Userscript to block ads on Twitch and automatically set the maximum ("Source") quality.

---


### Requirements

*   A web browser (like Chrome, Firefox, Edge, Opera).
*   A userscript manager browser extension. **Tampermonkey** is recommended:
    *   [Tampermonkey for Chrome](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
    *   [Tampermonkey for Firefox](https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/)
    *   [Tampermonkey for Edge](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd)
    *   [Tampermonkey for Opera](https://addons.opera.com/en/extensions/details/tampermonkey-beta/)

### Installation

1.  **Install Tampermonkey:** If you don't have it already, install the Tampermonkey extension for your browser using the links above.
2.  **Install the Script:**
    *   **Easiest Way:** Click on this link: [Install Script](https://raw.githubusercontent.com/ShmidtS/Twitch-Adblock/main/Twitch%20Adblock%20Fix%20%26%20Force%20Source%20Quality.user.js)
    *   Tampermonkey should automatically detect the userscript and open a new tab asking for confirmation.
    *   Review the script details and permissions, then click "Install".
    *   **(Alternative) Manual Install:**
        *   Go to the script's source code URL: [Script Source](https://raw.githubusercontent.com/ShmidtS/Twitch-Adblock/main/Twitch%20Adblock%20Fix%20%26%20Force%20Source%20Quality.user.js)
        *   Select and copy the entire script code (Ctrl+A, Ctrl+C or Cmd+A, Cmd+C).
        *   Open the Tampermonkey extension menu in your browser and click "Dashboard".
        *   Go to the "Utilities" tab.
        *   Under "Import from file", paste the copied code into the text area under "Install from URL" (or use the clipboard import if available).
        *   Click "Install" or "Process".
        *   Confirm the installation on the next screen.

3.  **Verify:** Go to Twitch.tv. The script should now be active. You might need to refresh any open Twitch pages.

### Configuration

You can fine-tune the script's behavior via Tampermonkey's storage settings:

1.  Open the Tampermonkey Dashboard.
2.  Click on the script name: `Twitch Adblock Fix & Force Source Quality (with Monitoring)`.
3.  Go to the **Storage** tab.
4.  **Important:** After changing any values, you **must save** them (often automatic, but check your Tampermonkey version) and **refresh** any open Twitch pages for the changes to take effect.

### How it Works (Briefly)

*   **Ad Blocking:** The script intercepts network requests made by the Twitch player, specifically those requesting stream playlists (M3U8 files). It injects code into a Web Worker which then filters these playlists to remove segments marked as advertisements before they reach the player.
*   **Quality Control:** The script interacts with the Twitch player's internal API. It finds the player instance, retrieves the list of available qualities, identifies the "Source" quality (usually `chunked`), and calls the player's function to set that quality.

### Troubleshooting / Notes

*   **Twitch Updates:** Twitch frequently updates its site and player. This can break the script's functionality (both ad blocking and quality control).
*   **Effectiveness:** Ad blocking methods are constantly evolving. While this script uses a common technique, its effectiveness may vary and might not block all ad types perfectly.

### License

MIT License

---


### Требования

*   Веб-браузер (например, Chrome, Firefox, Edge, Opera).
*   Расширение-менеджер пользовательских скриптов. Рекомендуется **Tampermonkey**:
    *   [Tampermonkey для Chrome](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
    *   [Tampermonkey для Firefox](https://addons.mozilla.org/ru/firefox/addon/tampermonkey/)
    *   [Tampermonkey для Edge](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd)
    *   [Tampermonkey для Opera](https://addons.opera.com/ru/extensions/details/tampermonkey-beta/)

### Установка

1.  **Установите Tampermonkey:** Если у вас его еще нет, установите расширение Tampermonkey для вашего браузера по ссылкам выше.
2.  **Установите скрипт:**
    *   **Самый простой способ:** Перейдите по этой ссылке: [Установить скрипт](https://raw.githubusercontent.com/ShmidtS/Twitch-Adblock/main/Twitch%20Adblock%20Fix%20%26%20Force%20Source%20Quality.user.js)
    *   Tampermonkey должен автоматически обнаружить пользовательский скрипт и открыть новую вкладку с запросом на подтверждение.
    *   Просмотрите детали скрипта и разрешения, затем нажмите "Установить".
    *   **(Альтернатива) Ручная установка:**
        *   Перейдите по URL-адресу исходного кода скрипта: [Исходный код скрипта](https://raw.githubusercontent.com/ShmidtS/Twitch-Adblock/main/Twitch%20Adblock%20Fix%20%26%20Force%20Source%20Quality.user.js)
        *   Выделите и скопируйте весь код скрипта (Ctrl+A, Ctrl+C или Cmd+A, Cmd+C).
        *   Откройте меню расширения Tampermonkey в браузере и нажмите "Панель управления".
        *   Перейдите на вкладку "Утилиты".
        *   В разделе "Импорт из файла" вставьте скопированный код в текстовое поле под "Установить из URL" (или используйте импорт из буфера обмена, если доступно).
        *   Нажмите "Установить" или "Обработать".
        *   Подтвердите установку на следующем экране.

3.  **Проверка:** Перейдите на Twitch.tv. Скрипт должен быть активен. Возможно, потребуется обновить открытые страницы Twitch.

### Настройка

Вы можете точно настроить поведение скрипта через параметры хранилища Tampermonkey:

1.  Откройте Панель управления Tampermonkey.
2.  Нажмите на имя скрипта: `Twitch Adblock Fix & Force Source Quality (with Monitoring)`.
3.  Перейдите на вкладку **Хранилище** (Storage).
4.  **Важно:** После изменения любых значений вы **должны сохранить** их (часто происходит автоматически, но проверьте вашу версию Tampermonkey) и **обновить** все открытые страницы Twitch, чтобы изменения вступили в силу.

### Как это работает (кратко)

*   **Блокировка рекламы:** Скрипт перехватывает сетевые запросы плеера Twitch, особенно запросы плейлистов потока (файлы M3U8). Он внедряет код в Web Worker, который затем фильтрует эти плейлисты, удаляя сегменты, помеченные как реклама, прежде чем они достигнут плеера.
*   **Контроль качества:** Скрипт взаимодействует с внутренним API плеера Twitch. Он находит экземпляр плеера, получает список доступных качеств, определяет качество "Источник" (обычно `chunked`) и вызывает функцию плеера для установки этого качества.

### Устранение неполадок / Примечания

*   **Обновления Twitch:** Twitch часто обновляет свой сайт и плеер. Это может нарушить функциональность скрипта (как блокировку рекламы, так и контроль качества).
*   **Эффективность:** Методы блокировки рекламы постоянно развиваются. Хотя этот скрипт использует распространенный метод, его эффективность может варьироваться и он может не идеально блокировать все типы рекламы.

### Лицензия

MIT License
