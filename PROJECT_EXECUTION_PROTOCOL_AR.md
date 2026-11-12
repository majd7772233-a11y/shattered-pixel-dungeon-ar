# بروتوكول تنفيذ مشروع Shattered Pixel Dungeon Multiplayer

> **وثيقة إلزامية لكل محادثة حتى نهاية المشروع.**  
> المستودع: majd7772233-a11y/shattered-pixel-dungeon-ar  
> الفرع الوحيد: multiplayer-framework-core-14118577486727081892  
> يمنع العمل على master أو الدمج إليه أو إنشاء فرع بديل دون طلب صريح من المستخدم.

## 1. الهدف وطريقة تقسيم العمل

المشروع يتكون من 23 مرحلة رئيسية في ROADMAP.md. لتجنب تكرار الاستكشاف والتوقف المتكرر في منتصف العمل، ينفذ الآن على شرائح مترابطة: **شريحة واحدة محددة في كل محادثة**، ثم توثيق نقطة النهاية وتسليم أمر واضح للمحادثة التالية.

«نصف مرحلة» لا يعني نسبة حسابية. المقصود وحدة عمل متماسكة تنتهي عند حد تقني قابل للاختبار، مثل مسار كامل من استدعاء SPD الأصلي حتى البروتوكول والخادم والعميل والاختبارات.

**تقسيم المحادثات لا يغيّر تعريف اكتمال المرحلة الرئيسية.** تبقى Phase 9 مفتوحة حتى اكتمال كل شروطها. لا يجوز نقل بند غير مكتمل إلى Phase 10 لمجرد أن المحادثة انتهت.

## 2. بداية كل محادثة — خطوات إلزامية بالترتيب

1. افتح المستودع والفرع المذكورين أعلاه، واقرأ HEAD الحالي من GitHub مباشرة.
2. افحص آخر Commit: الرسالة، التاريخ، parent، الملفات المتغيرة والـdiff. لا تفترض أن SHA في رسالة التسليم ما زال هو HEAD.
3. افحص GitHub Actions المطابق تمامًا لـHEAD الحالي. اقرأ jobs وsteps وملخصات الاختبارات وسجلات الفشل. لا تنسب نجاح CI قديم إلى Commit أحدث.
4. اقرأ **كل ملفات Markdown في الفرع الحالي**. القائمة المعروفة في القسم 11. افحص شجرة المستودع واكتشف أي ملفات MD جديدة واقرأها أيضًا.
5. طابق الوثائق بالمصدر والاختبارات. الكود والاختبارات هما الحقيقة التنفيذية عند الاختلاف؛ أصلح الوثائق في نفس وحدة العمل.
6. عيّن شريحة واحدة برقم مثل 9-C، وحدد هدفها وحدودها والملفات المتوقعة وشروط قبولها والاختبارات المطلوبة.
7. تتبع المسار الكامل: Native SPD → serialization/wire/schema → Worker validation/authority/SQL → accepted event/sequence → MessageRouter/reconciliation/snapshot/resync.
8. لا تبدأ التنفيذ قبل أن تعرف ما الموجود فعلًا وما الذي تغير منذ آخر checkpoint.

رسالة التسليم تختصر وقت الاستكشاف، لكنها لا تستبدل فحص HEAD أو قراءة الملفات.

## 3. ما تنفذه المحادثة الواحدة

- شريحة واحدة معلنة فقط.
- يمكن أن تتضمن عدة commits مترابطة على الفرع نفسه.
- أكمل السلسلة التشغيلية المتأثرة، لا scaffolding أو validator منفردًا مع ترك العميل أو الخادم مكسورًا.
- أضف اختبارات نجاح وفشل وسلطة وهوية وstale/replay وresync حسب طبيعة المسار.
- إذا كشف CI عيبًا تابعًا لنفس الشريحة، أصلحه وأعد الاختبارات قبل التسليم.
- لا تبدأ الشريحة التالية تلقائيًا بعد النجاح. حدّث الحالة، اكتب handoff جديدًا، ثم توقف حتى يرسل المستخدم الرسالة في محادثة جديدة.
- لا تعد بعمل خلفي ولا تدّع أن شيئًا اكتمل دون commit واختبار يثبت ذلك.

## 4. نموذج تعريف الشريحة

يجب أن يسجل كل تسليم:

| الحقل | المحتوى |
|---|---|
| معرّف الشريحة | مثال 9-C |
| المرحلة الأم | الرقم من ROADMAP.md |
| الهدف | نتيجة تقنية واحدة واضحة |
| HEAD البداية | SHA الحالي وCommit الأخير |
| النطاق | السلوك والملفات الداخلة |
| خارج النطاق | ما لا نبدأه الآن |
| شروط القبول | نتائج قابلة للاختبار |
| الاختبارات | Backend/Java/Integration/CI المطلوبة |
| النتيجة | commits والملفات ونتائج الاختبارات |
| المتبقي | البنود الدقيقة التي لم تُغلق |
| التالي | معرّف الشريحة وسبب ترتيبها |

إذا ظهر عمل خارج النطاق، أضفه إلى المتبقي ولا تخلطه بالشريحة الحالية إلا إذا كان blocker مباشرًا لا يمكن قبول الشريحة بدونه.

## 5. الاختبارات ومعيار الإثبات

- Backend: npm ci ثم npm run build ثم npm test. تحقق من static schema/native validation الذي تشغله دورة الاختبارات.
- Android: ./gradlew test assembleDebug --no-daemon باستخدام JDK 17 كما في workflow.
- Protocol: طابق protocol/schema.json مع Java serializers/enums وWorker validators وMessageRouter. وجود حقل في Java والخادم لا يعفي من schema.
- Native effects: دع Java SPD الأصلي يحسم الضرر والتوقيت والـRNG. لا تنشئ معادلات تقريبية في TypeScript.
- Integration: اختبر MatchRoom/WebSocket authority flow الحقيقي عندما يكون ذلك مطلوبًا؛ لا تسمِّ pure-validator test اختبارًا end-to-end.
- Failure: اختبر duplicate/stale/replay/authority/target disappearing/miss/cancel/rollback/resync عندما ينطبق.
- بعد آخر تعديل كود، يجب أن يكون CI على SHA النهائي ناجحًا. لا تخلط نجاح docs-only أو parent commit مع كود أحدث.
- عدد Vitest executions ليس عدد السيناريوهات المصدرية الفريدة إذا كانت ملفات TS/JS مولّدة ومكررة.
- Android success يتطلب نجاح JVM tests وassembleDebug من نفس الـworkflow.

## 6. قواعد Git

1. الفرع الدائم multiplayer-framework-core-14118577486727081892.
2. لا تكتب على master ولا تدمج ولا تنشئ PR/branch بديل دون طلب.
3. قبل تحديث ref، اقرأ HEAD واستخدم expected_sha حتى لا تكتب فوق تغيير أحدث.
4. Commit messages باللغة الإنجليزية وتصف التغيير.
5. راجع كل ملف تغير في كل Commit.
6. ميّز بين آخر gameplay code/test SHA وآخر documentation SHA؛ docs-only Commit يغيّر HEAD لكنه لا يغير كود اللعبة.
7. إذا فشل CI، أصلح السبب وأنشئ Commit جديدًا وأعد CI قبل التسليم.

## 7. التوثيق المستمر

في كل شريحة حدّث ما ينطبق من:

- GPT.md: checkpoint والـHEAD والـCI والاكتشافات والمخاطر والشريحة التالية.
- ROADMAP.md: Phase status وacceptance items وprogress log. لا تغلق parent phase مبكرًا.
- المرجع الفني المناسب: ANDROID_NATIVE_INTEGRATION.md أو AUTHORITATIVE_DATA_FLOWS.md أو SERVER_VALIDATION_AND_STORAGE.md أو PROTOCOL_MESSAGE_CATALOG.md.
- TEST_MATRIX.md: ما تم تغطيته فعلًا وما بقي بلا اختبار.
- docs/multiplayer/README.md: فهرس الحالة ومصادر الحقيقة عند تغيّرها.
- PROJECT_EXECUTION_PROTOCOL_AR.md: عدله فقط إذا تغيرت طريقة العمل الدائمة.

تحديث ملفات التوثيق يجب أن يكون في نفس وحدة العمل المنطقية مع الكود والاختبارات. إذا ظهرت وثيقة تصف سلوكًا قديمًا، أصلحها بدل إضافة فقرة جديدة متناقضة.

## 8. إنهاء المحادثة وتسليمها

قبل التوقف:

1. تأكد أن جميع التغييرات محفوظة في الفرع وأن working tree ليس فيه عمل غير موثق.
2. سجّل HEAD البداية والنهائي وcommits الكود/الاختبار/التوثيق.
3. سجّل CI المطابق، نتيجة Backend وAndroid وعدد الاختبارات.
4. حدّث GPT.md وROADMAP.md والمراجع الفنية وTEST_MATRIX.
5. اكتب للمستخدم رسالة عربية مفصلة جاهزة للنسخ إلى محادثة جديدة.
6. يجب أن تطلب الرسالة من المحادثة الجديدة: قراءة جميع MD، فحص آخر Commit والـdiff، التحقق من CI، ثم تنفيذ الشريحة التالية فقط.
7. توقف بعد إرسال الرسالة. لا تبدأ الشريحة التالية في نفس المحادثة.

## 9. علاقة الشرائح بالمراحل الـ23

المراحل الرئيسية لا يعاد ترقيمها ولا تستبدل بالشرائح:

- Phase 1–8: مكتملة للتنفيذ والقبول الآلي وفق ROADMAP.
- Phase 9: جزئية ومفتوحة؛ تقسّم إلى 9-A و9-B و9-C… حسب حدود العمل.
- Phase 10: لا تبدأ حتى تغلق Phase 9 بكل acceptance criteria.
- Phase 10–21: تنفذ بالطريقة نفسها، شريحة لكل محادثة.
- Phase 22: automated cross-layer verification and deployed-service preflight.
- Phase 23: physical-device playtest بقيادة المستخدم، وهي الأخيرة.
- إصلاح ظهر في Phase 23 يسجل كمتابعة جديدة بعد الخطة، ولا يخفى داخل مرحلة قديمة.

## 10. الحالة التقنية الحالية عند آخر تدقيق — 2026-11-12

### المستودع والـHEAD
- Repo: `majd7772233-a11y/shattered-pixel-dungeon-ar`.
- Branch: `multiplayer-framework-core-14118577486727081892` فقط.
- Current branch HEAD (docs-only): `89ff19fc9369ca990ffac4f3105f6022a6985d22` — `Document exact Phase 9-C SpiritArrow handoff checkpoint`; parent `9168284e67d353a956fc276e0ea8c00d1c685f1d`. Changed 13 Markdown files only.
- Latest gameplay/test SHA: `9168284e67d353a956fc276e0ea8c00d1c685f1d` — `Type payload on SpiritArrow publisher messages`; parent `f5f88a11c693589a4f6f41486ab0dc65824306f7`.
- يوجد 21 ملف Markdown حاليًا؛ افحص الشجرة واقرأ كلها، وأي MD جديد.


### CI المطابق
- [43290836162 — FAILURE](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43290836162).
- Current docs-HEAD workflow [43294778145 — FAILURE](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43294778145); backend tests retain the same four mirrored failures, while Android JVM/Debug APK is green.
- Backend TypeScript/schema build checks ناجحة.
- Vitest: 8 ملفات، 654 ناجحة و4 فاشلة من 658 تنفيذًا؛ الفشل حالتان فقط مكررتان في TS والنسخة JS المولدة.
- Android JVM tests و`assembleDebug` ناجحان.

### حالة 9-C
- المسار الإيجابي: publisher socket يرى `COMBAT_REQUEST → ACTION_ACCEPTED → ERROR`؛ الاختبار يتوقف قبل إثبات EVENT_BATCH للطالب.
- المسار السلبي للموضع المزوّر: الخادم يرسل ERROR مرتبطًا بالطلب إلى الطالب، والاختبار ما زال يتوقع عدم إرسال شيء. اختبار حذف الموضع تم تحديثه ويتوقع correlated ERROR ويمر.
- الـpositive fixture يضع `attackerPos: 9` بالفعل؛ واختبار Java يفحص أن التقرير الأصلي من RemoteHero يساوي `remoteHero.pos`. لا تعاود فرضية أن هذا الحقل مفقود، ولا تضعف validation.
- `f5f88a11` أضاف استثناء مرسل FOV بحسب playerId من WebSocket attachment إضافةً إلى object identity. افحص سبب ERROR بعد ACK وrecipient/sequence بدقة.
- الاختبارات المحلية تصل إلى MissileSprite الأصلي في headless JVM وتستدعي completion يدويًا؛ لا تختبر animation مرسومة.
- لا يزال ترتيب `finishNativeSpiritArrowAttack()` بعد `remoteHero.shoot()` بحاجة إلى تتبع مع MissileSprite callback وHero deferred report.

### التالي
- شريحة واحدة فقط: 9-C SpiritArrow authority result، asynchronous completion، requester EVENT_BATCH reconciliation، hit/miss وinvalid target/Bow/mark، exceptions/cancel، duplicate/replay/resync.
- Phase 9 تظل مفتوحة؛ Phase 10 لا تبدأ حتى اكتمال قبول Phase 9.
- لا يوجد ادعاء Worker live smoke أو Durable Object SQLite/restart أو rendered animation أو physical two-device.

### الالتزام بالخطة الدائمة
- محادثة واحدة = شريحة مترابطة واحدة قابلة للاختبار، نحو نصف مرحلة عند الاقتضاء.
- في كل محادثة جديدة: refetch HEAD/diff/CI، اقرأ كل Markdown، نفّذ الشريحة المطلوبة فقط، وثّق واختبر، ثم اكتب handoff عربي وتوقف. لا تبدأ الشريحة التالية تلقائيًا.


## 11. ملفات Markdown التي يجب قراءتها عند كل بداية

ابدأ بفحص شجرة الفرع لتكتشف الملفات الجديدة، ثم اقرأ القائمة المعروفة كاملة:

1. GPT.md
2. ROADMAP.md
3. PROJECT_EXECUTION_PROTOCOL_AR.md
4. MULTIPLAYER_CONTINUATION_NOTES.md (للتاريخ فقط)
5. docs/PULL_REQUEST_TEMPLATE.md
6. docs/getting-started-android.md
7. docs/getting-started-desktop.md
8. docs/getting-started-ios.md
9. docs/recommended-changes.md
10. docs/multiplayer/README.md
11. docs/multiplayer/PROJECT_OVERVIEW.md
12. docs/multiplayer/SYSTEM_ARCHITECTURE.md
13. docs/multiplayer/COMPONENT_AND_FILE_MAP.md
14. docs/multiplayer/AUTHORITATIVE_DATA_FLOWS.md
15. docs/multiplayer/ANDROID_NATIVE_INTEGRATION.md
16. docs/multiplayer/SERVER_VALIDATION_AND_STORAGE.md
17. docs/multiplayer/PROTOCOL_MESSAGE_CATALOG.md
18. docs/multiplayer/TEST_MATRIX.md
19. docs/multiplayer/SESSION_RECOVERY_AND_SECURITY.md
20. docs/multiplayer/SOURCE_FILE_REFERENCE.md
21. docs/multiplayer/BUILD_TEST_AND_CI.md

أي MD جديد يظهر في الشجرة يضاف للقائمة ويقرأ أيضًا.

## 12. قالب رسالة التسليم للمحادثة التالية

انسخ النموذج التالي في نهاية كل محادثة بعد تعبئة بياناته. يجب أن يكون بالعربية، وأن يطلب التحقق من كل شيء من جديد:

---
نواصل مشروع Shattered Pixel Dungeon Multiplayer.

**المستودع:** majd7772233-a11y/shattered-pixel-dungeon-ar  
**الفرع:** multiplayer-framework-core-14118577486727081892  
**آخر HEAD عند التسليم:** [ضع SHA الفعلي]  
**آخر Commit:** [الرسالة وSHA]  
**آخر CI مطابق:** [workflow ID والرابط والنتائج]

قبل أي تعديل:
1. اقرأ جميع ملفات MD الموجودة في الفرع، بما فيها PROJECT_EXECUTION_PROTOCOL_AR.md والقائمة التي يحتويها.
2. افحص آخر Commit والـparent والـdiff وتحقق من أن HEAD لم يتغير.
3. اقرأ ROADMAP وGPT ثم المراجع الفنية والاختبارات الخاصة بالشريحة.
4. تحقق من CI المطابق، ولا تعتمد على أرقام قديمة.

**الشريحة المطلوب تنفيذها الآن:** [المعرف والوصف].  
**آخر نقطة مؤكدة:** [السلوك والملفات والاختبارات].  
**المتبقي داخل هذه الشريحة:** [بنود محددة].  
**شروط قبولها:** [نتائج قابلة للاختبار].

نفذ هذه الشريحة وحدها من البداية إلى نهاية مسارها، ولا تبدأ الشريحة التالية أو المرحلة التالية. حافظ على Java SPD الأصلي كمصدر قواعد اللعب. حدّث الكود والاختبارات وschema والوثائق المتأثرة وGPT.md وROADMAP.md وTEST_MATRIX.md باستمرار. شغّل Backend build/tests وAndroid JVM tests وassembleDebug، ثم تحقق من CI على SHA النهائي.

بعد إكمال الشريحة: احفظ commits على الفرع نفسه، وثق HEAD والاختبارات والحدود والمتبقي، ثم أعطني رسالة عربية مفصلة جاهزة للمحادثة الجديدة للشريحة التالية. لا تدّع اكتمال المرحلة الأم إلا بعد إغلاق كل قبولها.
---