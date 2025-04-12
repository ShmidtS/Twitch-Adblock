# Twitch Adblock Fix & Force Source Quality (with Monitoring)

**Version:** 17.2.0

**(RU)** Скрипт для блокировки рекламы на Twitch и автоматической установки максимального качества ("Источник") с постоянным мониторингом.
**(EN)** Userscript to block ads on Twitch and automatically set the maximum ("Source") quality with continuous monitoring.

---

## English

### Features

*   **Ad Blocking:** Attempts to block Twitch video ads (pre-roll and mid-roll) by intercepting and modifying stream manifest files (M3U8) using a Worker-based proxy approach.
*   **Force Source Quality:** Automatically sets the video quality to the highest available option ("Source" or equivalent, often labeled as `chunked`) when a stream starts.
*   **Quality Monitoring:** Continuously monitors the video quality at a set interval (default: 3 seconds).
*   **Automatic Correction:** If the quality drops below "Source" (e.g., due to network fluctuations or Twitch's adjustments, especially when switching tabs/windows), the script automatically attempts to set it back to "Source".
*   **Configurable:** Various logging and behavior options can be adjusted through the Tampermonkey storage interface.
*   **Update Checker:** Checks for new script versions automatically.
*   **(Optional) Ad Banner:** Displays a small, temporary banner indicating when ads were removed.

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
4.  You can modify the values for the following keys:
    *   `TTV_AdBlock_DebugLog` (true/false): Enable verbose debug messages in the browser console. Default: `false`.
    *   `TTV_AdBlock_ShowBanner` (true/false): Show the "Ad removed" banner. Default: `true`.
    *   `TTV_AdBlock_InjectWorkers` (true/false): Enable the core ad-blocking method via Worker injection. **Disabling this will likely break ad blocking.** Default: `true`.
    *   `TTV_AdBlock_ForceSource` (true/false): Enable automatic setting and monitoring of "Source" quality. Default: `true`.
    *   `TTV_AdBlock_MonitorQuality` (true/false): Enable the *continuous* monitoring and correction of quality after initial setup. Requires `TTV_AdBlock_ForceSource` to be `true`. Default: `true`.
    *   `TTV_AdBlock_MonitorInterval` (number): Interval in milliseconds for checking video quality. Default: `3000` (3 seconds).
    *   `TTV_AdBlock_Log...` (true/false): Various other logging options (M3U8 cleaning, network blocking, etc.). Defaults vary.
5.  **Important:** After changing any values, you **must save** them (often automatic, but check your Tampermonkey version) and **refresh** any open Twitch pages for the changes to take effect.

### How it Works (Briefly)

*   **Ad Blocking:** The script intercepts network requests made by the Twitch player, specifically those requesting stream playlists (M3U8 files). It injects code into a Web Worker which then filters these playlists to remove segments marked as advertisements before they reach the player.
*   **Quality Control:** The script interacts with the Twitch player's internal API. It finds the player instance, retrieves the list of available qualities, identifies the "Source" quality (usually `chunked`), and calls the player's function to set that quality. The monitoring feature periodically repeats the check and correction process.

### Troubleshooting / Notes

*   **Twitch Updates:** Twitch frequently updates its site and player. This can break the script's functionality (both ad blocking and quality control). Keep the script updated via Tampermonkey.
*   **Conflicts:** Other ad blockers or Twitch-modifying extensions might conflict with this script. If you encounter issues, try disabling other related extensions temporarily.
*   **Console Logs:** If experiencing problems, open your browser's developer console (usually F12) and look for messages prefixed with `[TTV ADBLOCK vX.Y.Z]`. Enabling `TTV_AdBlock_DebugLog` can provide more detailed information.
*   **Effectiveness:** Ad blocking methods are constantly evolving. While this script uses a common technique, its effectiveness may vary and might not block all ad types perfectly.

### License

MIT License

### Author / Credits

*   Adapted and Enhanced by ShmidtS & Assistant
*   Based on previous ad-blocking techniques and scripts from the community.

---

## Русский

### Возможности

*   **Блокировка рекламы:** Пытается блокировать видеорекламу на Twitch (pre-roll и mid-roll) путем перехвата и изменения файлов манифеста потока (M3U8) с использованием прокси-подхода на основе Worker'ов.
*   **Принудительное качество "Источник":** Автоматически устанавливает качество видео на максимально доступное ("Источник" или эквивалент, часто обозначаемый как `chunked`) при запуске трансляции.
*   **Мониторинг качества:** Постоянно отслеживает качество видео с заданным интервалом (по умолчанию: 3 секунды).
*   **Автоматическая коррекция:** Если качество падает ниже "Источника" (например, из-за колебаний сети или настроек Twitch, особенно при переключении вкладок/окон), скрипт автоматически пытается вернуть его к "Источнику".
*   **Настраиваемый:** Различные параметры логирования и поведения можно настроить через интерфейс хранилища Tampermonkey.
*   **Проверка обновлений:** Автоматически проверяет наличие новых версий скрипта.
*   **(Опционально) Баннер о рекламе:** Отображает небольшой временный баннер, сообщающий об удалении рекламы.

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
4.  Вы можете изменить значения для следующих ключей:
    *   `TTV_AdBlock_DebugLog` (true/false): Включить подробные отладочные сообщения в консоли браузера. По умолчанию: `false`.
    *   `TTV_AdBlock_ShowBanner` (true/false): Показывать баннер "Реклама удалена". По умолчанию: `true`.
    *   `TTV_AdBlock_InjectWorkers` (true/false): Включить основной метод блокировки рекламы через внедрение в Worker'ы. **Отключение этого параметра, скорее всего, сломает блокировку рекламы.** По умолчанию: `true`.
    *   `TTV_AdBlock_ForceSource` (true/false): Включить автоматическую установку и мониторинг качества "Источник". По умолчанию: `true`.
    *   `TTV_AdBlock_MonitorQuality` (true/false): Включить *постоянный* мониторинг и коррекцию качества после первоначальной установки. Требует, чтобы `TTV_AdBlock_ForceSource` был `true`. По умолчанию: `true`.
    *   `TTV_AdBlock_MonitorInterval` (число): Интервал проверки качества видео в миллисекундах. По умолчанию: `3000` (3 секунды).
    *   `TTV_AdBlock_Log...` (true/false): Различные другие опции логирования (очистка M3U8, блокировка сети и т. д.). Значения по умолчанию могут различаться.
5.  **Важно:** После изменения любых значений вы **должны сохранить** их (часто происходит автоматически, но проверьте вашу версию Tampermonkey) и **обновить** все открытые страницы Twitch, чтобы изменения вступили в силу.

### Как это работает (кратко)

*   **Блокировка рекламы:** Скрипт перехватывает сетевые запросы плеера Twitch, особенно запросы плейлистов потока (файлы M3U8). Он внедряет код в Web Worker, который затем фильтрует эти плейлисты, удаляя сегменты, помеченные как реклама, прежде чем они достигнут плеера.
*   **Контроль качества:** Скрипт взаимодействует с внутренним API плеера Twitch. Он находит экземпляр плеера, получает список доступных качеств, определяет качество "Источник" (обычно `chunked`) и вызывает функцию плеера для установки этого качества. Функция мониторинга периодически повторяет процесс проверки и коррекции.

### Устранение неполадок / Примечания

*   **Обновления Twitch:** Twitch часто обновляет свой сайт и плеер. Это может нарушить функциональность скрипта (как блокировку рекламы, так и контроль качества). Поддерживайте скрипт в актуальном состоянии через Tampermonkey.
*   **Конфликты:** Другие блокировщики рекламы или расширения, изменяющие Twitch, могут конфликтовать с этим скриптом. Если вы столкнулись с проблемами, попробуйте временно отключить другие связанные расширения.
*   **Логи консоли:** При возникновении проблем откройте консоль разработчика вашего браузера (обычно F12) и ищите сообщения с префиксом `[TTV ADBLOCK vX.Y.Z]`. Включение `TTV_AdBlock_DebugLog` может предоставить более подробную информацию.
*   **Эффективность:** Методы блокировки рекламы постоянно развиваются. Хотя этот скрипт использует распространенный метод, его эффективность может варьироваться и он может не идеально блокировать все типы рекламы.

### Лицензия

MIT License

### Автор / Благодарности

*   Адаптировано и дополнено ShmidtS & Assistant
*   Основано на предыдущих методах блокировки рекламы и скриптах сообщества.
