# Module: src

> Generated navigation map. Source code is authoritative.

## `src/App.jsx`

- language: `jsx`
- size: 26664 bytes
- hash: `29fa7d3aa229`
- symbols:
  - `function` `App` — line 65
  - `function` `loadBytes` — line 77
  - `function` `importAnnotations` — line 118
  - `function` `toBox` — line 122
  - `function` `openFile` — line 172
  - `function` `openSample` — line 182
  - `function` `emptyPages` — line 227
  - `function` `runOcr` — line 232
  - `function` `dropDoc` — line 277
  - `function` `applyChanges` — line 282
  - `function` `typingInField` — line 317
  - `function` `onKey` — line 329
  - `function` `onBeforeUnload` — line 364
  - `function` `leaveEditor` — line 373
  - `function` `restart` — line 380
  - `function` `goHome` — line 381
  - `function` `openTool` — line 386
  - `function` `toolScreen` — line 404
- imports:
  - `./components/CommandPalette`
  - `./components/DocumentHistoryModal`
  - `./components/FormatBar`
  - `./components/Header`
  - `./components/Home`
  - `./components/Landing`
  - `./components/NaturalLanguageBar`
  - `./components/OcrModal`
  - `./components/SignModal`
  - `./components/Toolbar`
  - `./components/Workspace`
  - `./lib/exporter`
  - `./lib/extract`
  - `./lib/ocr`
  - `./lib/pdfjs`
  - `./lib/sample`
  - `./lib/workspace`
  - `./store`
  - `./tools`
  - `./utils/misc`
  - `react`

## `src/components/BottomBar.jsx`

- language: `jsx`
- size: 2038 bytes
- hash: `307b53808354`
- symbols:
  - `function` `BottomBar` — line 11
- imports:
  - `../store`
  - `react`

## `src/components/CommandPalette.jsx`

- language: `jsx`
- size: 6623 bytes
- hash: `fb4480ffb65c`
- symbols:
  - `function` `CommandPalette` — line 3
  - `function` `handleKeyDown` — line 43
- imports:
  - `../tools`
  - `react`

## `src/components/DocumentHistoryModal.jsx`

- language: `jsx`
- size: 4401 bytes
- hash: `066344f67290`
- symbols:
  - `function` `DocumentHistoryModal` — line 5
  - `function` `load` — line 9
  - `function` `handleRestore` — line 20
  - `function` `handleDelete` — line 30
- imports:
  - `../lib/db`
  - `../lib/workspace`
  - `./tools/shell`
  - `react`

## `src/components/FindPanel.jsx`

- language: `jsx`
- size: 4390 bytes
- hash: `ac0daa39fafe`
- symbols:
  - `function` `matchesIn` — line 8
  - `function` `FindPanel` — line 37
  - `function` `escape` — line 3
  - `function` `close` — line 48
  - `function` `step` — line 50
  - `function` `replaceAll` — line 62
- imports:
  - `../store`
  - `react`

## `src/components/FormatBar.jsx`

- language: `jsx`
- size: 9428 bytes
- hash: `3a7a4c5971b1`
- symbols:
  - `function` `FormatBar` — line 4
  - `function` `patch` — line 18
  - `function` `selectedBox` — line 28
  - `function` `commitRuns` — line 35
  - `function` `onSelection` — line 46
  - `function` `cmd` — line 55
  - `function` `sizeSelection` — line 60
  - `function` `patchObj` — line 73
  - `function` `remove` — line 79
- imports:
  - `../lib/runs`
  - `../store`
  - `react`

## `src/components/Header.jsx`

- language: `jsx`
- size: 1436 bytes
- hash: `08af4846b0f0`
- symbols:
  - `function` `Header` — line 3
- imports:
  - `../utils/misc`
  - `react`

## `src/components/Home.jsx`

- language: `jsx`
- size: 5590 bytes
- hash: `32d8ae7d77dd`
- symbols:
  - `function` `Home` — line 3
  - `function` `matchesSearch` — line 9
- imports:
  - `../tools`
  - `react`

## `src/components/Landing.jsx`

- language: `jsx`
- size: 3414 bytes
- hash: `4324a8b0551c`
- symbols:
  - `function` `Landing` — line 2
  - `function` `pick` — line 6
- imports:
  - `react`

## `src/components/Menu.jsx`

- language: `jsx`
- size: 6721 bytes
- hash: `67c349b2767f`
- symbols:
  - `function` `MenuBar` — line 13
  - `function` `Menu` — line 35
  - `function` `setOpen` — line 41
  - `function` `place` — line 61
  - `function` `onAway` — line 116
  - `function` `onKey` — line 121
  - `function` `onBtnEnter` — line 161
  - `function` `run` — line 165
- imports:
  - `react-dom`

## `src/components/NaturalLanguageBar.jsx`

- language: `jsx`
- size: 9716 bytes
- hash: `7c19c4b62fd5`
- symbols:
  - `function` `parseNaturalLanguageCommands` — line 9
  - `function` `NaturalLanguageBar` — line 112
  - `function` `handleParse` — line 119
  - `function` `handleExecute` — line 133
- imports:
  - `../lib/pdfa`
  - `../lib/pdfops`
  - `../lib/security`
  - `../lib/workspace`
  - `./tools/shell`
  - `react`

## `src/components/OcrModal.jsx`

- language: `jsx`
- size: 4372 bytes
- hash: `f16f351f8696`
- symbols:
  - `function` `OcrModal` — line 13
  - `function` `toggle` — line 19
  - `function` `run` — line 22
- imports:
  - `react`

## `src/components/PageView.jsx`

- language: `jsx`
- size: 32651 bytes
- hash: `a35b4fa35b69`
- symbols:
  - `function` `useSyncText` — line 9
  - `function` `readBack` — line 21
  - `function` `LineBox` — line 33
  - `function` `ObjBox` — line 80
  - `function` `Widget` — line 283
  - `function` `caretInfo` — line 331
  - `function` `setCaretAt` — line 352
  - `function` `caretFromPoint` — line 372
  - `function` `PageView` — line 388
  - `function` `toBase` — line 447
  - `function` `marksOverText` — line 461
  - `function` `push` — line 489
  - `function` `bindWindow` — line 521
  - `function` `mv` — line 524
  - `function` `up` — line 542
  - `function` `objDown` — line 550
  - `function` `resizeDown` — line 563
  - `function` `textObjDown` — line 571
  - `function` `lineDown` — line 578
  - `function` `onFocus` — line 586
  - `function` `onBlur` — line 588
  - `function` `makeInputHandlers` — line 592
  - `function` `lineIndexOf` — line 604
  - `function` `joinRuns` — line 606
  - `function` `moveCaretToSibling` — line 613
  - `function` `ensureBg` — line 632
  - `function` `joinWithPrev` — line 637
  - `function` `joinWithNext` — line 649
  - `function` `onKeyDown` — line 667
  - `function` `onPaste` — line 718
  - `function` `onOverlayDown` — line 731
  - `function` `mv` — line 769
  - `function` `up` — line 774
  - `function` `tiny` — line 784
- imports:
  - `../lib/colors`
  - `../lib/fonts`
  - `../lib/runs`
  - `../utils/misc`
  - `react`

## `src/components/SignModal.jsx`

- language: `jsx`
- size: 6931 bytes
- hash: `7ae0931df338`
- symbols:
  - `function` `trimCanvas` — line 9
  - `function` `SignModal` — line 35
  - `function` `pos` — line 57
  - `function` `down` — line 62
  - `function` `move` — line 74
  - `function` `up` — line 82
  - `function` `clear` — line 83
  - `function` `fromUpload` — line 89
  - `function` `useDrawn` — line 102
  - `function` `useTyped` — line 108
- imports:
  - `react`

## `src/components/Thumbs.jsx`

- language: `jsx`
- size: 4305 bytes
- hash: `52c6ce098d9e`
- symbols:
  - `function` `Thumb` — line 9
  - `function` `Thumbs` — line 81
- imports:
  - `react`

## `src/components/Toolbar.jsx`

- language: `jsx`
- size: 8355 bytes
- hash: `47826e661dcf`
- symbols:
  - `function` `Toolbar` — line 24
  - `function` `set` — line 27
  - `function` `onImgFile` — line 29
  - `function` `plain` — line 44
- imports:
  - `../store`
  - `./Menu`
  - `react`

## `src/components/Workspace.jsx`

- language: `jsx`
- size: 2799 bytes
- hash: `5f6928b4ceb7`
- symbols:
  - `function` `Workspace` — line 7
  - `function` `goTo` — line 11
  - `function` `onScroll` — line 20
- imports:
  - `../store`
  - `./BottomBar`
  - `./FindPanel`
  - `./PageView`
  - `./Thumbs`
  - `react`

## `src/components/tools/AiTool.jsx`

- language: `jsx`
- size: 11859 bytes
- hash: `0712aad52de5`
- symbols:
  - `function` `localExtractiveSummary` — line 6
  - `function` `searchDocumentAnswer` — line 57
  - `function` `AiTool` — line 91
  - `function` `extract` — line 115
  - `function` `handleAsk` — line 139
  - `function` `handleRegenerateSummary` — line 155
  - `function` `reset` — line 162
- imports:
  - `../../lib/pdfraster`
  - `./shell`
  - `react`

## `src/components/tools/BatchTool.jsx`

- language: `jsx`
- size: 11638 bytes
- hash: `a4b7e9fbb618`
- symbols:
  - `function` `BatchTool` — line 20
  - `function` `handleAddFiles` — line 28
  - `function` `removeFile` — line 44
  - `function` `clearAll` — line 46
  - `function` `runSingle` — line 47
  - `function` `runBatch` — line 100
  - `function` `cancelBatch` — line 134
  - `function` `downloadAllZip` — line 139
- imports:
  - `../../lib/markdown`
  - `../../lib/ocrpdf`
  - `../../lib/pdfops`
  - `../../lib/pdfraster`
  - `../../lib/security`
  - `./shell`
  - `react`

## `src/components/tools/CompareTool.jsx`

- language: `jsx`
- size: 16966 bytes
- hash: `36301d74b88d`
- symbols:
  - `function` `loadDoc` — line 6
  - `function` `CompareTool` — line 14
  - `function` `handleOpenA` — line 31
  - `function` `handleOpenB` — line 42
  - `function` `reset` — line 53
  - `function` `render` — line 67
- imports:
  - `../../lib/pdfjs`
  - `./shell`
  - `react`

## `src/components/tools/CompressTool.jsx`

- language: `jsx`
- size: 4098 bytes
- hash: `bdea46bef8c0`
- symbols:
  - `function` `CompressTool` — line 10
  - `function` `reset` — line 19
  - `function` `run` — line 21
- imports:
  - `../../lib/pdfops`
  - `./shell`
  - `react`

## `src/components/tools/CropTool.jsx`

- language: `jsx`
- size: 7016 bytes
- hash: `2f439d55edc7`
- symbols:
  - `function` `CropTool` — line 16
  - `function` `reset` — line 45
  - `function` `startDrag` — line 49
  - `function` `move` — line 52
  - `function` `clamp` — line 54
  - `function` `up` — line 61
  - `function` `run` — line 68
  - `function` `pct` — line 87
- imports:
  - `../../lib/pdfops`
  - `./shell`
  - `react`

## `src/components/tools/ExcelTool.jsx`

- language: `jsx`
- size: 4988 bytes
- hash: `b3579f09baa1`
- symbols:
  - `function` `ExcelTool` — line 6
  - `function` `reset` — line 15
  - `function` `load` — line 17
  - `function` `run` — line 22
  - `function` `showPreview` — line 54
- imports:
  - `../../lib/tables`
  - `../../lib/xlsx`
  - `../../utils/misc`
  - `./shell`
  - `react`

## `src/components/tools/ExportTool.jsx`

- language: `jsx`
- size: 4549 bytes
- hash: `efc82959e0b0`
- symbols:
  - `function` `ExportTool` — line 12
  - `function` `reset` — line 21
  - `function` `run` — line 23
- imports:
  - `../../lib/pdfops`
  - `../../lib/pdfraster`
  - `./shell`
  - `react`

## `src/components/tools/ExtractDataTool.jsx`

- language: `jsx`
- size: 11482 bytes
- hash: `51b414513467`
- symbols:
  - `function` `extractStructuredData` — line 11
  - `function` `ExtractDataTool` — line 106
  - `function` `handleExtract` — line 112
  - `function` `exportJson` — line 129
  - `function` `exportCsv` — line 135
  - `function` `exportExcel` — line 141
  - `function` `reset` — line 147
- imports:
  - `../../lib/xlsx`
  - `./shell`
  - `react`

## `src/components/tools/MarkdownTool.jsx`

- language: `jsx`
- size: 5173 bytes
- hash: `21898ce1908b`
- symbols:
  - `function` `MarkdownTool` — line 4
  - `function` `reset` — line 12
  - `function` `run` — line 20
  - `function` `handleCopy` — line 33
  - `function` `handleDownload` — line 52
- imports:
  - `../../lib/markdown`
  - `./shell`
  - `react`

## `src/components/tools/MergeTool.jsx`

- language: `jsx`
- size: 4209 bytes
- hash: `a025f967f612`
- symbols:
  - `function` `MergeTool` — line 6
  - `function` `isImage` — line 4
  - `function` `reset` — line 13
  - `function` `add` — line 15
  - `function` `move` — line 34
  - `function` `run` — line 44
- imports:
  - `../../lib/pdfops`
  - `./shell`
  - `react`

## `src/components/tools/MindMapTool.jsx`

- language: `jsx`
- size: 10041 bytes
- hash: `885870d52938`
- symbols:
  - `function` `buildMindMapTree` — line 5
  - `function` `MindMapTool` — line 56
  - `function` `generate` — line 71
  - `function` `handleNodeClick` — line 88
  - `function` `exportMarkdown` — line 93
  - `function` `exportJson` — line 106
  - `function` `exportSvg` — line 111
  - `function` `reset` — line 118
- imports:
  - `../../lib/extract`
  - `../../utils/misc`
  - `./shell`
  - `react`

## `src/components/tools/OcrTool.jsx`

- language: `jsx`
- size: 7727 bytes
- hash: `36cd1ec70d8c`
- symbols:
  - `function` `OcrTool` — line 14
  - `function` `reset` — line 25
  - `function` `toggle` — line 27
  - `function` `run` — line 29
- imports:
  - `../../lib/ocrpdf`
  - `../../lib/pdfraster`
  - `./shell`
  - `react`

## `src/components/tools/OrganiseTool.jsx`

- language: `jsx`
- size: 2989 bytes
- hash: `62473ad1a815`
- symbols:
  - `function` `OrganiseTool` — line 4
  - `function` `reset` — line 16
  - `function` `spinAll` — line 18
  - `function` `run` — line 25
- imports:
  - `../../lib/pdfops`
  - `./shell`
  - `react`

## `src/components/tools/PageTools.jsx`

- language: `jsx`
- size: 23101 bytes
- hash: `3564cc52d490`
- symbols:
  - `function` `FlipTool` — line 20
  - `function` `AnnotationsTool` — line 70
  - `function` `ResizeTool` — line 125
  - `function` `GrayscaleTool` — line 177
  - `function` `RenameTool` — line 226
  - `function` `BookmarksTool` — line 283
  - `function` `MixTool` — line 359
  - `function` `BatesTool` — line 434
  - `function` `FileCard` — line 8
  - `function` `reset` — line 27
  - `function` `run` — line 28
  - `function` `reset` — line 78
  - `function` `run` — line 79
  - `function` `reset` — line 132
  - `function` `run` — line 133
  - `function` `reset` — line 184
  - `function` `run` — line 185
  - `function` `reset` — line 238
  - `function` `run` — line 242
  - `function` `reset` — line 301
  - `function` `run` — line 303
  - `function` `reset` — line 366
  - `function` `add` — line 368
  - `function` `run` — line 376
  - `function` `reset` — line 446
  - `function` `add` — line 448
  - `function` `run` — line 456
- imports:
  - `../../lib/outline`
  - `./shell`
  - `react`

## `src/components/tools/PagesTool.jsx`

- language: `jsx`
- size: 2721 bytes
- hash: `689dec4987d3`
- symbols:
  - `function` `PagesTool` — line 4
  - `function` `reset` — line 11
  - `function` `toggle` — line 13
  - `function` `selectAll` — line 19
  - `function` `run` — line 22
- imports:
  - `../../lib/pdfops`
  - `./shell`
  - `react`

## `src/components/tools/PdfATool.jsx`

- language: `jsx`
- size: 3366 bytes
- hash: `66ee59445f3d`
- symbols:
  - `function` `PdfATool` — line 17
  - `function` `reset` — line 24
  - `function` `run` — line 26
- imports:
  - `../../lib/pdfa`
  - `./shell`
  - `react`

## `src/components/tools/PptTool.jsx`

- language: `jsx`
- size: 3265 bytes
- hash: `beae29c0fbe9`
- symbols:
  - `function` `PptTool` — line 5
  - `function` `reset` — line 13
  - `function` `run` — line 15
- imports:
  - `../../lib/pdfraster`
  - `../../lib/pptx`
  - `./shell`
  - `react`

## `src/components/tools/RedactTool.jsx`

- language: `jsx`
- size: 7100 bytes
- hash: `d9910f16a434`
- symbols:
  - `function` `RedactTool` — line 6
  - `function` `reset` — line 36
  - `function` `startDrag` — line 38
  - `function` `clamp` — line 42
  - `function` `draw` — line 43
  - `function` `up` — line 50
  - `function` `run` — line 69
  - `function` `pct100` — line 84
- imports:
  - `../../lib/pdfraster`
  - `./shell`
  - `react`

## `src/components/tools/ScanCleanerTool.jsx`

- language: `jsx`
- size: 8707 bytes
- hash: `7d7b85d7fbab`
- symbols:
  - `function` `ScanCleanerTool` — line 5
  - `function` `reset` — line 22
  - `function` `renderPreview` — line 29
  - `function` `runAll` — line 70
- imports:
  - `../../lib/imageproc`
  - `../../lib/workspace`
  - `./shell`
  - `react`

## `src/components/tools/ScanTool.jsx`

- language: `jsx`
- size: 13860 bytes
- hash: `da183c5ee6cb`
- symbols:
  - `function` `applyFilterToCanvas` — line 9
  - `function` `ScanTool` — line 35
  - `function` `startCamera` — line 48
  - `function` `stopCamera` — line 69
  - `function` `capturePhoto` — line 83
  - `function` `handleUploadPhotos` — line 95
  - `function` `rotatePage` — line 108
  - `function` `deletePage` — line 112
  - `function` `generatePdf` — line 116
  - `function` `reset` — line 170
- imports:
  - `./shell`
  - `react`

## `src/components/tools/SecurityTools.jsx`

- language: `jsx`
- size: 9728 bytes
- hash: `de368d424bc8`
- symbols:
  - `function` `ProtectTool` — line 13
  - `function` `UnlockTool` — line 109
  - `function` `RepairTool` — line 188
  - `function` `reset` — line 26
  - `function` `run` — line 30
  - `function` `reset` — line 117
  - `function` `take` — line 119
  - `function` `run` — line 124
  - `function` `reset` — line 194
  - `function` `take` — line 196
  - `function` `run` — line 201
- imports:
  - `../../lib/security`
  - `./shell`
  - `react`

## `src/components/tools/SigVerifyTool.jsx`

- language: `jsx`
- size: 7508 bytes
- hash: `196392431051`
- symbols:
  - `function` `inspectSignatures` — line 3
  - `function` `SigVerifyTool` — line 68
  - `function` `reset` — line 84
- imports:
  - `./shell`
  - `react`

## `src/components/tools/SmallTools.jsx`

- language: `jsx`
- size: 11169 bytes
- hash: `e30988dc1f5c`
- symbols:
  - `function` `NUpTool` — line 6
  - `function` `FlattenTool` — line 71
  - `function` `ImagesToPdfTool` — line 126
  - `function` `MetadataTool` — line 230
  - `function` `reset` — line 13
  - `function` `run` — line 15
  - `function` `reset` — line 77
  - `function` `run` — line 79
  - `function` `reset` — line 134
  - `function` `add` — line 136
  - `function` `move` — line 146
  - `function` `run` — line 151
  - `function` `reset` — line 242
  - `function` `run` — line 244
- imports:
  - `../../lib/pdfops`
  - `./shell`
  - `react`

## `src/components/tools/SplitMoreTools.jsx`

- language: `jsx`
- size: 12033 bytes
- hash: `7d155abe40e8`
- symbols:
  - `function` `FileCard` — line 5
  - `function` `SplitHalfTool` — line 17
  - `function` `SplitSizeTool` — line 67
  - `function` `SplitTextTool` — line 125
  - `function` `SplitBookmarksTool` — line 197
  - `function` `reset` — line 24
  - `function` `run` — line 26
  - `function` `reset` — line 75
  - `function` `run` — line 77
  - `function` `reset` — line 133
  - `function` `look` — line 135
  - `function` `run` — line 143
  - `function` `reset` — line 209
  - `function` `run` — line 215
- imports:
  - `../../lib/outline`
  - `../../lib/pdfops`
  - `./shell`
  - `react`

## `src/components/tools/SplitTool.jsx`

- language: `jsx`
- size: 3398 bytes
- hash: `60d103bb1cff`
- symbols:
  - `function` `SplitTool` — line 4
  - `function` `reset` — line 12
  - `function` `run` — line 14
- imports:
  - `../../lib/pdfops`
  - `./shell`
  - `react`

## `src/components/tools/StampTool.jsx`

- language: `jsx`
- size: 6896 bytes
- hash: `e33bb6a67ef0`
- symbols:
  - `function` `StampTool` — line 16
  - `function` `reset` — line 35
  - `function` `run` — line 37
- imports:
  - `../../lib/pdfops`
  - `./shell`
  - `react`

## `src/components/tools/WordTool.jsx`

- language: `jsx`
- size: 3673 bytes
- hash: `f201b2062837`
- symbols:
  - `function` `WordTool` — line 6
  - `function` `reset` — line 13
  - `function` `run` — line 15
- imports:
  - `../../lib/docx`
  - `../../lib/extract`
  - `../../utils/misc`
  - `./shell`
  - `react`

## `src/components/tools/WorkflowTool.jsx`

- language: `jsx`
- size: 15419 bytes
- hash: `23e87d444160`
- symbols:
  - `function` `WorkflowTool` — line 63
  - `function` `addStep` — line 77
  - `function` `removeStep` — line 83
  - `function` `moveStep` — line 87
  - `function` `updateStepParam` — line 98
  - `function` `handleSaveCustom` — line 102
  - `function` `executeWorkflow` — line 115
  - `function` `reset` — line 194
- imports:
  - `../../lib/db`
  - `../../lib/imageproc`
  - `../../lib/ocrpdf`
  - `../../lib/pdfa`
  - `../../lib/pdfops`
  - `../../lib/security`
  - `../../lib/workspace`
  - `./shell`
  - `react`

## `src/components/tools/shell.jsx`

- language: `jsx`
- size: 9451 bytes
- hash: `0ba9a99fdb39`
- symbols:
  - `function` `ToolShell` — line 23
  - `function` `DropArea` — line 44
  - `function` `usePdf` — line 80
  - `function` `PageThumb` — line 122
  - `function` `PageGrid` — line 151
  - `function` `Result` — line 181
  - `function` `PageBoard` — line 200
  - `function` `download` — line 4
  - `function` `baseOf` — line 15
  - `function` `prettySize` — line 17
  - `function` `take` — line 48
  - `function` `rotate` — line 203
  - `function` `remove` — line 206
  - `function` `move` — line 211
- imports:
  - `../../lib/pdfjs`
  - `../../lib/workspace`
  - `react`

## `src/lib/colors.js`

- language: `js`
- size: 2135 bytes
- hash: `6953c2096dd6`
- symbols:
  - `function` `histogram` — line 2
  - `function` `sampleTextColor` — line 32
  - `function` `sampleBgColor` — line 46
  - `function` `hex` — line 23
  - `function` `lum` — line 25
  - `function` `dist` — line 26

## `src/lib/db.js`

- language: `js`
- size: 3614 bytes
- hash: `5cd4b65cf11d`
- symbols:
  - `function` `openDB` — line 4
  - `function` `saveDocumentVersion` — line 23
  - `function` `getDocumentVersions` — line 47
  - `function` `deleteDocumentVersion` — line 65
  - `function` `saveCustomWorkflow` — line 79
  - `function` `getCustomWorkflows` — line 93
  - `function` `deleteCustomWorkflow` — line 107

## `src/lib/docx.js`

- language: `js`
- size: 3793 bytes
- hash: `29d0fffdc240`
- symbols:
  - `function` `paragraph` — line 17
  - `function` `buildDocx` — line 50
  - `function` `esc` — line 2
- imports:
  - `./zip`

## `src/lib/exporter.js`

- language: `js`
- size: 17230 bytes
- hash: `26dc8488c136`
- symbols:
  - `function` `embedImage` — line 4
  - `function` `convertToPng` — line 18
  - `function` `tokenize` — line 30
  - `function` `exportEditedPdf` — line 40
  - `function` `applyPageOrder` — line 333
  - `function` `writeLinks` — line 368
  - `function` `writeNewFields` — line 397
  - `function` `applyFormValues` — line 432
  - `function` `embedStd` — line 51
  - `function` `getFont` — line 60
  - `function` `measure` — line 107
  - `function` `X` — line 127
  - `function` `Y` — line 128
  - `function` `cover` — line 131
  - `function` `wrapWidthOf` — line 140
  - `function` `layout` — line 148
  - `function` `newRow` — line 162
  - `function` `draw` — line 185
  - `function` `patchRect` — line 223
- imports:
  - `../utils/misc`
  - `./colors`
  - `./fonts`

## `src/lib/extract.js`

- language: `js`
- size: 9721 bytes
- hash: `da69aafb4a15`
- symbols:
  - `function` `mul` — line 3
  - `function` `normFam` — line 14
  - `function` `pageSegments` — line 29
  - `function` `groupRows` — line 87
  - `function` `extractLines` — line 105
  - `function` `overlapPct` — line 172
  - `function` `groupParagraphs` — line 177
  - `function` `joinFlowing` — line 214
  - `function` `buildPara` — line 224
  - `function` `isBoldName` — line 24
  - `function` `isItalicName` — line 25
  - `function` `flush` — line 181
- imports:
  - `../utils/misc`
  - `./fonts`

## `src/lib/fonts.js`

- language: `js`
- size: 4546 bytes
- hash: `b9c0f2e257a7`
- symbols:
  - `function` `winAnsiCanEncode` — line 24
  - `function` `fontUrl` — line 35
  - `function` `cleanFontFamilyName` — line 42
  - `function` `ensureFontLoadedInBrowser` — line 54
  - `function` `fetchTtfBuffer` — line 83
  - `function` `styleIndex` — line 33

## `src/lib/imageproc.js`

- language: `js`
- size: 4681 bytes
- hash: `b2bc14758fe9`
- symbols:
  - `function` `autoCropCanvas` — line 2
  - `function` `rotateCanvas` — line 46
  - `function` `deskewCanvas` — line 64
  - `function` `cleanDocumentCanvas` — line 120

## `src/lib/markdown.js`

- language: `js`
- size: 4522 bytes
- hash: `fb65b7aa8e9d`
- symbols:
  - `function` `escapeCell` — line 4
  - `function` `rowCells` — line 10
  - `function` `pdfToMarkdown` — line 32
- imports:
  - `../utils/misc`
  - `./extract`
  - `./pdfjs`

## `src/lib/ocr.js`

- language: `js`
- size: 4207 bytes
- hash: `ac7bcef2d788`
- symbols:
  - `function` `ocrScaleFor` — line 10
  - `function` `renderForOcr` — line 18
  - `function` `toLines` — line 33
  - `function` `ocrPage` — line 83
- imports:
  - `../utils/misc`
  - `./extract`

## `src/lib/ocrpdf.js`

- language: `js`
- size: 8640 bytes
- hash: `b16c4ff9d637`
- symbols:
  - `function` `ocrToSearchablePdf` — line 10
  - `function` `ocrToWord` — line 105
  - `function` `ocrToMarkdown` — line 170
  - `function` `fontFor` — line 36
- imports:
  - `./../utils/misc`
  - `./fonts`
  - `./ocr`
  - `./pdfjs`

## `src/lib/outline.js`

- language: `js`
- size: 3179 bytes
- hash: `0f442a38c257`
- symbols:
  - `function` `destinationPage` — line 3
  - `function` `readOutline` — line 14
  - `function` `detectHeadings` — line 33
  - `function` `pageKeys` — line 64
  - `function` `firstLines` — line 84
  - `function` `walk` — line 20
  - `function` `boundariesOf` — line 82
- imports:
  - `../utils/misc`
  - `./extract`

## `src/lib/pdfa.js`

- language: `js`
- size: 2597 bytes
- hash: `6a51717b385a`
- symbols:
  - `function` `convertToPdfA` — line 1

## `src/lib/pdfjs.js`

- language: `js`
- size: 186 bytes
- hash: `a7f4215a18e4`
- imports:
  - `pdfjs-dist`
  - `pdfjs-dist/build/pdf.worker.min.mjs?url`

## `src/lib/pdfops.js`

- language: `js`
- size: 26769 bytes
- hash: `f32a8830d602`
- symbols:
  - `function` `embedRaster` — line 9
  - `function` `deletePages` — line 27
  - `function` `extractPages` — line 54
  - `function` `parseRanges` — line 69
  - `function` `splitPdf` — line 90
  - `function` `zipFiles` — line 112
  - `function` `mergeDocuments` — line 118
  - `function` `cropPdf` — line 151
  - `function` `reencodeJpeg` — line 186
  - `function` `compressPdf` — line 208
  - `function` `organisePages` — line 250
  - `function` `nUpPdf` — line 267
  - `function` `placeText` — line 307
  - `function` `stampPdf` — line 318
  - `function` `flattenPdf` — line 397
  - `function` `imagesToPdf` — line 413
  - `function` `readMetadata` — line 437
  - `function` `writeMetadata` — line 450
  - `function` `mixDocuments` — line 464
  - `function` `splitInHalf` — line 489
  - `function` `splitBySize` — line 517
  - `function` `flipPdf` — line 563
  - `function` `removeAnnotations` — line 585
  - `function` `batesNumber` — line 612
  - `function` `addBookmarks` — line 645
  - `function` `splitAt` — line 679
  - `function` `load` — line 2
  - `function` `asBlob` — line 7
  - `function` `hex` — line 326
  - `function` `fill` — line 332
  - `function` `safe` — line 440
  - `function` `set` — line 453
  - `function` `build` — line 527
  - `function` `push` — line 533
- imports:
  - `./zip`

## `src/lib/pdfraster.js`

- language: `js`
- size: 6727 bytes
- hash: `e1b1b41eee0b`
- symbols:
  - `function` `renderPage` — line 2
  - `function` `pagesToImages` — line 19
  - `function` `pdfToText` — line 37
  - `function` `extractImages` — line 70
  - `function` `redactPdf` — line 125
  - `function` `toBytes` — line 14
- imports:
  - `./pdfjs`

## `src/lib/pptx.js`

- language: `js`
- size: 9690 bytes
- hash: `2c1985bb349f`
- symbols:
  - `function` `slideXml` — line 15
  - `function` `buildPptx` — line 76
  - `function` `esc` — line 8
  - `function` `slideRels` — line 30
  - `function` `colour` — line 58
- imports:
  - `./zip`

## `src/lib/runs.js`

- language: `js`
- size: 3835 bytes
- hash: `fae2d969810c`
- symbols:
  - `function` `cssColorToHex` — line 7
  - `function` `mergeRuns` — line 25
  - `function` `runsText` — line 36
  - `function` `isPlain` — line 40
  - `function` `domToRuns` — line 44
  - `function` `runsToHtml` — line 77
  - `function` `stripRunProp` — line 95
  - `function` `runsForText` — line 106
  - `function` `hex2` — line 5
  - `function` `sameStyle` — line 21
  - `function` `walk` — line 47
  - `function` `escapeHtml` — line 74

## `src/lib/sample.js`

- language: `js`
- size: 5281 bytes
- hash: `ac52ad531f4a`
- symbols:
  - `function` `wrap` — line 1
  - `function` `makeSamplePdf` — line 15

## `src/lib/security.js`

- language: `js`
- size: 1949 bytes
- hash: `00ff48eb22e6`
- symbols:
  - `function` `protectPdf` — line 8
  - `function` `unlockPdf` — line 27
  - `function` `repairPdf` — line 45
  - `function` `lib` — line 4
  - `function` `asBlob` — line 5

## `src/lib/tables.js`

- language: `js`
- size: 2532 bytes
- hash: `83fb126713f3`
- symbols:
  - `function` `rowToCells` — line 6
  - `function` `buildColumns` — line 30
  - `function` `readTable` — line 54
  - `function` `columnOf` — line 44
- imports:
  - `./extract`

## `src/lib/textfont.js`

- language: `js`
- size: 1018 bytes
- hash: `bd6f22413879`
- symbols:
  - `function` `pickFont` — line 6
- imports:
  - `../utils/misc`
  - `./fonts`

## `src/lib/workspace.js`

- language: `js`
- size: 1528 bytes
- hash: `905583302400`
- symbols:
  - `function` `notify` — line 7
  - `function` `getActiveDocument` — line 12
  - `function` `setActiveDocument` — line 16
  - `function` `updateActiveDocument` — line 44
  - `function` `clearActiveDocument` — line 54
  - `function` `useWorkspaceDoc` — line 59
  - `function` `handler` — line 64
- imports:
  - `./db`
  - `./pdfjs`
  - `react`

## `src/lib/xlsx.js`

- language: `js`
- size: 3871 bytes
- hash: `44395f5fd713`
- symbols:
  - `function` `colName` — line 11
  - `function` `cell` — line 24
  - `function` `sheetXml` — line 35
  - `function` `buildXlsx` — line 44
  - `function` `esc` — line 2
- imports:
  - `./zip`

## `src/lib/zip.js`

- language: `js`
- size: 2911 bytes
- hash: `75c9a55393d5`
- symbols:
  - `function` `crc32` — line 14
  - `function` `zipSync` — line 22
  - `function` `CRC_TABLE` — line 4
  - `function` `utf8` — line 20
  - `function` `push` — line 27

## `src/main.jsx`

- language: `jsx`
- size: 435 bytes
- hash: `c29f9f9ce463`
- imports:
  - `./App`
  - `react`
  - `react-dom/client`

## `src/store.js`

- language: `js`
- size: 6808 bytes
- hash: `ddc2b7bb1917`
- symbols:
  - `function` `reducer` — line 65
  - `function` `withPage` — line 58

## `src/styles.css`

- language: `css`
- size: 35139 bytes
- hash: `00894228c7d1`

## `src/tools.jsx`

- language: `jsx`
- size: 15767 bytes
- hash: `add397747649`
- symbols:
  - `function` `svg` — line 2
  - `function` `toolById` — line 299
- imports:
  - `react`

## `src/utils/misc.js`

- language: `js`
- size: 3375 bytes
- hash: `067f1ffb7287`
- symbols:
  - `function` `hexToRgb01` — line 18
  - `function` `sanitizeWinAnsi` — line 29
  - `function` `familyMetrics` — line 66
  - `function` `topForBaseline` — line 83
  - `function` `uid` — line 4
  - `function` `clamp` — line 6
  - `function` `slackOf` — line 8
  - `function` `famCss` — line 16
  - `function` `baseName` — line 39
  - `function` `fontCssOf` — line 44
- imports:
  - `../lib/fonts`

