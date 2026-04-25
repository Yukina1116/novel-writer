// firebase-admin / firebase SDK が emulator host を import 時点で参照する可能性に
// 備え、副作用 import としてプロセス先頭で env を確定させる。ESM hoisting で他 import
// より先に評価されることが本ファイルの存在意義。
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= 'localhost:9099';
