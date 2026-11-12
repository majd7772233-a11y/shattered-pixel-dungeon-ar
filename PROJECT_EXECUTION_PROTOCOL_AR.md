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

- المستودع: `majd7772233-a11y/shattered-pixel-dungeon-ar`
- الفرع الوحيد: `multiplayer-framework-core-14118577486727081892`
- Latest repository/documentation HEAD: `8eec2bd45b6922f9f6d9814e634ec9ffd7b77c23` — `Refresh multiplayer README handoff status`.
- Latest gameplay code/test SHA: `377fa362772fb5367b548f44686e129493b1be14` — `Diagnose native SpiritArrow mark action setup`.
- المقارنة بينهما تؤكد أن commits اللاحقة للـgameplay SHA كانت Markdown-only.
- عدد ملفات Markdown الحالي: **21**؛ يجب إعادة scan وقراءة جميعها في المحادثة الجديدة، إضافة إلى أي MD مستجد.

### CI على الرأس الحالي

- Exact repository HEAD CI: [43228606923 — FAILURE](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43228606923).
- Backend: TypeScript build ناجح؛ Phase 7 native mutation schema validator ناجح؛ SpiritArrow schema validator ناجح؛ 8 ملفات Vitest و652 تنفيذًا ناجحًا. العدد executions وليس 652 سيناريو فريدًا.
- Android: 88 JVM tests، منها فشلان في `:core:test`. لم يصل Gradle إلى `assembleDebug`.
- الفشل الأول: `nativeSnipersMarkSpiritArrowTargetDisappearingBeforeMissileCompletionCancelsAndResyncs` — `Pending SpiritArrow missing; resync=true, missileCreated=false`.
- الفشل الثاني: `nativeSnipersMarkSpiritArrowCompletesFromTheRealMissileCallbackExactlyOnce` — `SnipersMark must retain the pending report until the missile completes; resync=true, bowSniper=false, missileCreated=false`.
- آخر baseline أخضر قبل 9-C: `0a70053addd976fc6d4330af52330d7593ee1bc4` / [CI 43198856325](https://github.com/majd7772233-a11y/shattered-pixel-dungeon-ar/actions/runs/43198856325)، تاريخي فقط.

### المرحلة والشريحة النشطة

- Phases 1–8 مكتملة للتنفيذ والقبول الآلي.
- Phase 9 جزئية ومفتوحة؛ Phases 10–23 مفتوحة.
- الشريحة الوحيدة الحالية: **9-C — SpiritArrow asynchronous lifecycle and authority-result roundtrip**. لا تبدأ شريحة أخرى في هذه المحادثة الجديدة.

### الموجود بالفعل في 9-C

- Stable Bow item identity وSnipersMark ID/bonus وstable marked Mob ID.
- `SPIRIT_ARROW` و`spiritArrow` strict contract في `protocol/schema.json`، مع شروط Mob/RANGED/`engineRanged=true` ورفض `projectileMutation`.
- `server/scripts/validate-spirit-arrow-schema.mjs` ضمن `npm test` وينجح في Backend CI.
- Backend validator وMatchRoom pending-authority reservation/forwarding واختبارات منفصلة لها.
- Publisher-side MessageRouter simulation/tests.
- Completion context/callback attempt داخل `SpiritBow.SpiritArrow`.

### العطل غير المحسوم

- المسار المحلي غير المثبت: `SnipersMark.doAction() → SpiritArrow.cast() → MissileSprite.onComplete()`.
- الاختباران يفشلان بعد `doAction()`، مع `resync=true` و`missileCreated=false`؛ لذلك لا يصل الاختبار إلى test MissileSprite أو callback.
- الاحتمال الأول: `Hero.beginNativeSpiritArrowAttack(...)` تعيد `false` بسبب guard. الاحتمال الثاني: `SpiritArrow.cast(...)` ترمي RuntimeException ويؤدي catch إلى `sniperSpecial=false) وcancel pending report وRESYNC.
- Guards: multiplayer session active؛ Hero pre-state غير فارغ؛ SpiritArrow JSON غير فارغ؛ Bow bundle غير فارغ؛ `markBuffId >= 1)؛ `pendingNativeSpiritArrowDataJson == null)؛ `pendingNativeProjectileMutationJson == null)؛ `deferNativeCombatReport == false`.
- أول خطوة: سجّل كل guard على حدة وحدد الذي أعاد false؛ سجّل/احفظ RuntimeException الأصلي وstack trace إذا دخل cast في catch. لا تخفِ الاستثناء خلف RESYNC ولا تضعف guards.
- `CapturingMissileGroup/TestMissileSprite` headless test doubles؛ تلتقط callback وتستدعيه يدويًا ولا ترسم animation. الفشل الحالي قبل إنشاء MissileSprite.

### شروط قبول 9-C المتبقية

1. إصلاح السبب الحقيقي وتمرير المسار الأصلي من `SnipersMark.doAction()` حتى إنشاء missile.
2. إكمال/إلغاء وتنظيف exactly-once للـhit/miss/target moved-or-removed/invalid Bow-mark-entity/exception/duplicate/cancel/stale/replay/resync.
3. اختبار end-to-end واحد: request → pending authority → designated publisher native execution → accepted event/result → requester reconciliation.
4. إبقاء SPEED three-shot volley وnon-Mob targets fail-closed.
5. Backend build/tests وAndroid JVM tests و`assembleDebug` يجب أن تنجح على exact final SHA نفسه.

### ما تبقى داخل Phase 9 بعد 9-C

Real Durable Object SQLite rollback/restart/crash؛ publisher authority handoff/disconnect؛ level-up XP/`Hero.updateHT()`/item callbacks؛ Monk variants؛ RemoteHero/player LifeLink؛ المزيد من consumables وoverlapping DOT/HoT/shield/detach؛ reconnect/expiry/malformed/replay/resync. Phase 9 لا تُغلق قبل جميع شروط ROADMAP.

### حدود العمل

- 9-C سبق أن لمس `SnipersMark.java`, `Hero.java`, `Item.java`, `SpiritBow.java`, `MessageRouter.java`, `NativeHeroBuffTickPublisher.java`, `SPDLevelSnapshot.java`, `WorldSnapshot.java`, `NativeCombatRuntimeIntegrationTest.java`، بالإضافة إلى protocol schema وserver validators/handlers/tests. راجع diff قبل التعديل.
- لا يوجد live Worker smoke test أو real Durable Object SQLite session أو physical two-device match مثبت حاليًا.

### أمر المحادثة التالية

افحص live HEAD/آخر commit/diff/CI أولًا؛ اقرأ جميع ملفات MD الـ21 وأي ملفات جديدة؛ نفّذ 9-C فقط. ابدأ بتشخيص begin-return-false مقابل cast-exception، ثم أكمل native lifecycle والـauthority roundtrip. حدّث الوثائق، اختبر، تحقق من CI على exact final gameplay SHA، واكتب رسالة handoff عربية جديدة ثم توقف. لا تبدأ 9-D أو Phase 10 في المحادثة نفسها.


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