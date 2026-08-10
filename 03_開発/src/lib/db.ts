import Dexie, { Table } from 'dexie';

export interface Novel {
  id?: string;
  title: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Character {
  id?: string;
  novelId?: string; // 関連する小説ID (外部キー)
  name: string;
  images: {
    input: string;  // インプットのまま (元画像)
    front?: string; // 正面
    side?: string;  // 横向き
  };
  characterVisual: string; // AI画像解析による外見特徴MD
  characterProfile: string; // ユーザー入力による詳細プロフィールMD
  createdAt: Date;
  updatedAt: Date;
}


export interface Scene {
  id?: string;
  novelId?: string; // 関連する小説ID (外部キー)
  name: string; // シーン名
  text: string; // 小説本文
  characterIds: string[]; // 登場キャラクターのIDリスト
  aiSituation: string; // AI抽出によるシーン設定MD
  createdAt: Date;
  updatedAt: Date;
}


export interface GeneratedImage {
  id?: string;
  sceneId: string; // 関連するシーンID
  image: string; // 生成画像 Base64 dataURL
  createdAt: Date;
  updatedAt: Date;
}

export class IllustrationMakerDatabase extends Dexie {
  novels!: Table<Novel>;
  characters!: Table<Character>;
  scenes!: Table<Scene>;
  generatedImages!: Table<GeneratedImage>;

  constructor() {
    super('IllustrationMakerDB');
    this.version(2).stores({
      novels: 'id, title, createdAt, updatedAt',
      characters: 'id, novelId, name, createdAt, updatedAt',
      scenes: 'id, novelId, createdAt, updatedAt',
      generatedImages: 'id, sceneId, createdAt, updatedAt'
    });
  }
}

export const db = new IllustrationMakerDatabase();

