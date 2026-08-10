'use client';

import React, { useState, useEffect, useRef } from 'react';
import { db, Character, Scene, GeneratedImage, Novel } from '../lib/db';
import {
  analyzeCharacterVisual,
  extractSceneSituation,
  generateIllustration,
  generateCharacterPose,
  INITIAL_VISUAL_TEMPLATE,
  INITIAL_PROFILE_TEMPLATE,
  INITIAL_SITUATION_TEMPLATE
} from '../lib/ai';

export default function Home() {
  // ナビゲーションタブ
  const [activeTab, setActiveTab] = useState<'novel' | 'character' | 'scene'>('novel');

  // API Key
  const [apiKey, setApiKey] = useState<string>('');

  // ---------- 小説管理 (タブ0) の状態 ----------
  const [novelList, setNovelList] = useState<Novel[]>([]);
  const [selectedNovelId, setSelectedNovelId] = useState<string | null>(null);
  const [novelTitle, setNovelTitle] = useState<string>('');
  const [novelDescription, setNovelDescription] = useState<string>('');
  const [novelCreatedAt, setNovelCreatedAt] = useState<Date | null>(null);
  const [novelUpdatedAt, setNovelUpdatedAt] = useState<Date | null>(null);

  // ---------- キャラクター管理 (タブ1) の状態 ----------
  const [characterList, setCharacterList] = useState<Character[]>([]);
  const [selectedCharId, setSelectedCharId] = useState<string | null>(null);

  // フォーム用
  const [charName, setCharName] = useState<string>('');
  const [charImageBase64, setCharImageBase64] = useState<string>('');
  const [charImages, setCharImages] = useState<{ input: string; front?: string; side?: string }>({ input: '' });

  const [charVisual, setCharVisual] = useState<string>('');
  const [charProfile, setCharProfile] = useState<string>('');
  const [charCreatedAt, setCharCreatedAt] = useState<Date | null>(null);
  const [charUpdatedAt, setCharUpdatedAt] = useState<Date | null>(null);

  const [isAnalyzingChar, setIsAnalyzingChar] = useState<boolean>(false);
  const [charPoseAngle, setCharPoseAngle] = useState<'input' | 'front' | 'side'>('input');
  const [isGeneratingPose, setIsGeneratingPose] = useState<boolean>(false);


  // ---------- シーン・挿絵生成 (タブ2) の状態 ----------
  const [sceneList, setSceneList] = useState<Scene[]>([]);
  const [generatedBatch, setGeneratedBatch] = useState<Array<{ angle: string; angleLabel: string; image: string }>>([]);
  const [sceneText, setSceneText] = useState<string>('');

  const [sceneName, setSceneName] = useState<string>('');


  const [selectedCharIds, setSelectedCharIds] = useState<string[]>([]);
  const [aiSituation, setAiSituation] = useState<string>(INITIAL_SITUATION_TEMPLATE);
  const [aspectRatio, setAspectRatio] = useState<'2:3' | '3:4'>('2:3');
  const [sceneCreatedAt, setSceneCreatedAt] = useState<Date | null>(null);
  const [sceneUpdatedAt, setSceneUpdatedAt] = useState<Date | null>(null);

  const [currentSceneId, setCurrentSceneId] = useState<string | null>(null);
  const [historyImages, setHistoryImages] = useState<GeneratedImage[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const [isExtractingSituation, setIsExtractingSituation] = useState<boolean>(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 小説一覧取得
  const loadNovels = async () => {
    const list = await db.novels.orderBy('updatedAt').reverse().toArray();
    setNovelList(list);
    return list;
  };

  // 初期ロード：IndexedDBから小説、キャラクター、シーン情報、APIキーを読み込み
  useEffect(() => {
    const init = async () => {
      // 1. 小説リストのロード
      let list = await db.novels.orderBy('updatedAt').reverse().toArray();
      
      // 「AI事務員宮西さん」というタイトルの小説を検索、なければ作成
      let targetNovel = list.find(n => n.title === 'AI事務員宮西さん');
      if (!targetNovel) {
        const newId = crypto.randomUUID();
        targetNovel = {
          id: newId,
          title: 'AI事務員宮西さん',
          description: 'デフォルトで作成された小説プロジェクトです。',
          createdAt: new Date(),
          updatedAt: new Date()
        };
        await db.novels.put(targetNovel);
        list = [targetNovel, ...list];
      }
      const targetNovelId = targetNovel.id!;
      setNovelList(list);

      // 2. 既存の過去データをすべて「AI事務員宮西さん」に紐づける
      const allChars = await db.characters.toArray();
      for (const char of allChars) {
        if (char.novelId !== targetNovelId) {
          await db.characters.update(char.id!, { novelId: targetNovelId });
        }
      }
      const allScenes = await db.scenes.toArray();
      for (const scene of allScenes) {
        if (scene.novelId !== targetNovelId) {
          await db.scenes.update(scene.id!, { novelId: targetNovelId });
        }
      }

      // 3. 小説選択状態の復元
      let activeNovelId = localStorage.getItem('sashie_selected_novel_id');
      if (!activeNovelId || !list.some(n => n.id === activeNovelId)) {
        activeNovelId = targetNovelId;
      }
      setSelectedNovelId(activeNovelId);
      localStorage.setItem('sashie_selected_novel_id', activeNovelId || targetNovelId);

      // 小説フォーム情報の読み込み
      const activeNovel = list.find(n => n.id === activeNovelId);
      if (activeNovel) {
        setNovelTitle(activeNovel.title);
        setNovelDescription(activeNovel.description);
        setNovelCreatedAt(activeNovel.createdAt);
        setNovelUpdatedAt(activeNovel.updatedAt);
      }

      // 4. キャラクター & シーンロード
      await loadCharacters(activeNovelId);
      await loadScenes(activeNovelId);

      // 5. APIキー復元
      const savedApiKey = localStorage.getItem('gemini_api_key');
      if (savedApiKey) setApiKey(savedApiKey);

      // 6. アクティブタブ復元
      const savedTab = localStorage.getItem('sashie_active_tab');
      if (savedTab === 'novel' || savedTab === 'character' || savedTab === 'scene') {
        setActiveTab(savedTab as 'novel' | 'character' | 'scene');
      }

      // 7. 選択中キャラクター復元
      const savedCharId = localStorage.getItem('sashie_selected_char_id');
      if (savedCharId) {
        const char = await db.characters.get(savedCharId);
        if (char && char.novelId === activeNovelId) {
          setSelectedCharId(char.id || null);
          setCharName(char.name);
          const images = char.images || { input: (char as any).image || '' };
          setCharImages(images);
          setCharImageBase64(images.input);
          setCharPoseAngle('input');
          setCharVisual(char.characterVisual);
          setCharProfile(char.characterProfile);
          setCharCreatedAt(char.createdAt);
          setCharUpdatedAt(char.updatedAt);
        } else {
          localStorage.removeItem('sashie_selected_char_id');
        }
      }

      // 8. 選択中シーン復元
      const savedSceneId = localStorage.getItem('sashie_selected_scene_id');
      if (savedSceneId) {
        const scene = await db.scenes.get(savedSceneId);
        if (scene && scene.novelId === activeNovelId) {
          setCurrentSceneId(scene.id || null);
          setSceneName(scene.name || '');
          setSceneText(scene.text);
          setSelectedCharIds(scene.characterIds);
          setAiSituation(scene.aiSituation);
          setSceneCreatedAt(scene.createdAt);
          setSceneUpdatedAt(scene.updatedAt);

          const history = await db.generatedImages.where('sceneId').equals(scene.id!).reverse().sortBy('createdAt');
          setHistoryImages(history);
          if (history.length > 0) {
            setSelectedImage(history[0].image);
          }
        } else {
          localStorage.removeItem('sashie_selected_scene_id');
        }
      }
    };
    init();
  }, []);

  // キャラクター一覧取得
  const loadCharacters = async (novelId: string | null = selectedNovelId) => {
    if (!novelId) {
      setCharacterList([]);
      return;
    }
    const chars = await db.characters.where('novelId').equals(novelId).reverse().sortBy('updatedAt');
    setCharacterList(chars);
  };

  // シーン一覧取得
  const loadScenes = async (novelId: string | null = selectedNovelId) => {
    if (!novelId) {
      setSceneList([]);
      return;
    }
    const scenes = await db.scenes.where('novelId').equals(novelId).reverse().sortBy('updatedAt');
    setSceneList(scenes);
  };

  // タブ切り替えとステータス維持
  const handleTabChange = (tab: 'novel' | 'character' | 'scene') => {
    setActiveTab(tab);
    localStorage.setItem('sashie_active_tab', tab);
  };

  // 小説一覧から選択
  const handleSelectNovel = async (novelId: string) => {
    setSelectedNovelId(novelId);
    localStorage.setItem('sashie_selected_novel_id', novelId);

    // キャラクター・シーンフォームのクリア
    handleClearCharForm();
    handleClearSceneForm();

    // データのロード
    await loadCharacters(novelId);
    await loadScenes(novelId);

    const novel = await db.novels.get(novelId);
    if (novel) {
      setNovelTitle(novel.title);
      setNovelDescription(novel.description);
      setNovelCreatedAt(novel.createdAt);
      setNovelUpdatedAt(novel.updatedAt);
    }
  };

  // 小説情報の保存
  const handleSaveNovel = async () => {
    if (!novelTitle) {
      alert('小説のタイトルを入力してください。');
      return;
    }

    const now = new Date();
    const id = selectedNovelId && novelList.some(n => n.id === selectedNovelId) ? selectedNovelId : crypto.randomUUID();

    const novelData: Novel = {
      id,
      title: novelTitle,
      description: novelDescription,
      createdAt: novelCreatedAt || now,
      updatedAt: now
    };

    try {
      await db.novels.put(novelData);
      setSelectedNovelId(id);
      localStorage.setItem('sashie_selected_novel_id', id);
      setNovelCreatedAt(novelData.createdAt);
      setNovelUpdatedAt(now);

      await loadNovels();
      await loadCharacters(id);
      await loadScenes(id);
      alert('小説情報を保存しました。');
    } catch (err: any) {
      alert(`小説保存エラー: ${err.message}`);
    }
  };

  // 新規小説作成用にクリア
  const handleClearNovelForm = () => {
    setSelectedNovelId(null);
    setNovelTitle('');
    setNovelDescription('');
    setNovelCreatedAt(null);
    setNovelUpdatedAt(null);

    // 新規作成時は紐付くキャラ・シーンがないため一旦クリア
    setCharacterList([]);
    setSceneList([]);
    handleClearCharForm();
    handleClearSceneForm();
  };

  // 小説の削除
  const handleDeleteNovel = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('この小説および、小説に関連するキャラクター、シーン、生成された挿絵画像をすべて削除しますか？')) {
      try {
        await db.novels.delete(id);

        // 関連キャラクターの削除
        const chars = await db.characters.where('novelId').equals(id).toArray();
        for (const c of chars) {
          if (c.id) await db.characters.delete(c.id);
        }

        // 関連シーンおよびその画像の削除
        const scenes = await db.scenes.where('novelId').equals(id).toArray();
        for (const s of scenes) {
          if (s.id) {
            await db.scenes.delete(s.id);
            const imgs = await db.generatedImages.where('sceneId').equals(s.id).toArray();
            for (const img of imgs) {
              if (img.id) await db.generatedImages.delete(img.id);
            }
          }
        }

        const list = await loadNovels();
        if (selectedNovelId === id) {
          if (list.length > 0) {
            await handleSelectNovel(list[0].id!);
          } else {
            handleClearNovelForm();
          }
        }
        alert('小説および関連するすべてのデータを削除しました。');
      } catch (err: any) {
        alert(`削除エラー: ${err.message}`);
      }
    }
  };

  // APIキーの変更

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const key = e.target.value;
    setApiKey(key);
    localStorage.setItem('gemini_api_key', key);
  };

  // 画像（Base64）の白い背景を透過処理に変換するユーティリティ
  const removeWhiteBackground = (base64Url: string, threshold = 245): Promise<string> => {

    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Url;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(base64Url);
          return;
        }
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // 白色の領域（RGBがすべて閾値以上）を透過
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          if (r >= threshold && g >= threshold && b >= threshold) {
            data[i + 3] = 0; // Alpha
          }
        }
        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => {
        resolve(base64Url);
      };
    });
  };

  // ---------- タブ1: キャラクター関連処理 ----------
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        const transparentBase64 = await removeWhiteBackground(base64);
        setCharImageBase64(transparentBase64);
        setCharImages(prev => ({ ...prev, [charPoseAngle]: transparentBase64 }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        const transparentBase64 = await removeWhiteBackground(base64);
        setCharImageBase64(transparentBase64);
        setCharImages(prev => ({ ...prev, [charPoseAngle]: transparentBase64 }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handlePoseAngleChange = (angle: 'input' | 'front' | 'side') => {
    setCharPoseAngle(angle);
    setCharImageBase64(charImages[angle] || '');
  };








  // 1. AI設定読み込みボタン

  const handleAnalyzeVisual = async () => {
    if (!charImages.input) {
      alert('インプット(元画像)となる立ち絵画像を選択してください。');
      return;
    }
    if (!apiKey) {
      alert('画面上部の入力欄に Google AI Studio の APIキーを入力してください。');
      return;
    }

    setIsAnalyzingChar(true);
    try {
      const name = charName || '無題キャラクター';
      const visualMD = await analyzeCharacterVisual(charImages.input, name, apiKey);
      setCharVisual(visualMD);
      if (!charProfile) {
        setCharProfile(INITIAL_PROFILE_TEMPLATE(name));
      }
    } catch (err: any) {
      alert(`AI解析エラー: ${err.message}`);
    } finally {
      setIsAnalyzingChar(false);
    }
  };


  // 2. キャラクター保存ボタン
  const handleSaveCharacter = async () => {
    if (!charName) {
      alert('キャラクター名を入力してください。');
      return;
    }
    if (!charImages.input) {
      alert('インプット(元画像)となる立ち絵画像をアップロードしてください。');
      return;
    }
    if (!apiKey) {
      alert('ポーズ画像の同時生成とキャラクター保存を行うため、画面上部の入力欄に Google AI Studio の APIキーを入力してください。');
      return;
    }

    setIsGeneratingPose(true);
    try {
      const now = new Date();
      const id = selectedCharId || crypto.randomUUID();
      const visualMD = charVisual || INITIAL_VISUAL_TEMPLATE(charName);
      const profileMD = charProfile || INITIAL_PROFILE_TEMPLATE(charName);

      // 正面・横向き画像がまだない場合は自動生成
      let frontBase64 = charImages.front || '';
      let sideBase64 = charImages.side || '';

      if (!frontBase64 || !sideBase64) {
        // 並列で正面と横向きを生成
        const [frontRes, sideRes] = await Promise.all([
          !frontBase64 ? generateCharacterPose(charImages.input, visualMD, 'front', apiKey) : Promise.resolve(''),
          !sideBase64 ? generateCharacterPose(charImages.input, visualMD, 'side', apiKey) : Promise.resolve('')
        ]);

        if (frontRes) {
          frontBase64 = await removeWhiteBackground(frontRes);
        }
        if (sideRes) {
          sideBase64 = await removeWhiteBackground(sideRes);
        }
      }

      const updatedImages = {
        input: charImages.input,
        front: frontBase64 || undefined,
        side: sideBase64 || undefined
      };

      const charData: Character = {
        id,
        novelId: selectedNovelId || undefined,
        name: charName,
        images: updatedImages,
        characterVisual: visualMD,
        characterProfile: profileMD,
        createdAt: charCreatedAt || now,
        updatedAt: now
      };

      await db.characters.put(charData);
      setSelectedCharId(id);
      setCharImages(updatedImages);
      setCharImageBase64(updatedImages[charPoseAngle] || updatedImages.input);
      setCharCreatedAt(charData.createdAt);
      setCharUpdatedAt(now);
      localStorage.setItem('sashie_selected_char_id', id);
      await loadCharacters();
      alert('キャラクター情報と同時に「正面」「横向き」ポーズ画像を生成・透過して保存しました！');
    } catch (err: any) {
      alert(`キャラクター保存・ポーズ生成エラー: ${err.message}`);
    } finally {
      setIsGeneratingPose(false);
    }
  };


  // キャラクター一覧からカード選択
  const handleSelectCharacter = (char: Character) => {
    setSelectedCharId(char.id || null);
    setCharName(char.name);
    const images = char.images || { input: (char as any).image || '' };
    setCharImages(images);
    setCharImageBase64(images.input);
    setCharPoseAngle('input');
    setCharVisual(char.characterVisual);
    setCharProfile(char.characterProfile);
    setCharCreatedAt(char.createdAt);
    setCharUpdatedAt(char.updatedAt);
    if (char.id) {
      localStorage.setItem('sashie_selected_char_id', char.id);
    }
  };


  // 新規キャラクター作成状態へクリア
  const handleClearCharForm = () => {
    setSelectedCharId(null);
    setCharName('');
    setCharImageBase64('');
    setCharImages({ input: '' });
    setCharPoseAngle('input');
    setCharVisual('');
    setCharProfile('');
    setCharCreatedAt(null);
    setCharUpdatedAt(null);
    localStorage.removeItem('sashie_selected_char_id');
  };


  // キャラクター削除
  const handleDeleteCharacter = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('このキャラクターを削除しますか？')) {
      await db.characters.delete(id);
      if (selectedCharId === id) handleClearCharForm();
      await loadCharacters();
    }
  };

  // ---------- タブ2: シーン・挿絵生成処理 ----------
  const handleToggleCharSelect = (charId: string) => {
    setSelectedCharIds(prev =>
      prev.includes(charId)
        ? prev.filter(id => id !== charId)
        : [...prev, charId]
    );
  };

  // シーン一覧から選択
  const handleSelectScene = async (scene: Scene) => {
    setCurrentSceneId(scene.id || null);
    setSceneName(scene.name || '');
    setSceneText(scene.text);
    setSelectedCharIds(scene.characterIds);
    setAiSituation(scene.aiSituation);
    setSceneCreatedAt(scene.createdAt);
    setSceneUpdatedAt(scene.updatedAt);
    if (scene.id) {
      localStorage.setItem('sashie_selected_scene_id', scene.id);
    }


    // 生成履歴の読み込み
    if (scene.id) {
      const history = await db.generatedImages.where('sceneId').equals(scene.id).reverse().sortBy('createdAt');
      setHistoryImages(history);
      if (history.length > 0) {
        setSelectedImage(history[0].image);
      } else {
        setSelectedImage(null);
      }
    } else {
      setHistoryImages([]);
      setSelectedImage(null);
    }
  };

  // 新規シーン作成状態にクリア
  const handleClearSceneForm = () => {
    setCurrentSceneId(null);
    setSceneName('');
    setSceneText('');
    setSelectedCharIds([]);
    setAiSituation(INITIAL_SITUATION_TEMPLATE);
    setSceneCreatedAt(null);
    setSceneUpdatedAt(null);
    setHistoryImages([]);
    setSelectedImage(null);
    localStorage.removeItem('sashie_selected_scene_id');
  };


  // シーンの削除
  const handleDeleteScene = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('このシーンおよび関連する生成画像をすべて削除しますか？')) {
      await db.scenes.delete(id);
      // 関連する生成画像も削除
      const images = await db.generatedImages.where('sceneId').equals(id).toArray();
      for (const img of images) {
        if (img.id) await db.generatedImages.delete(img.id);
      }
      if (currentSceneId === id) handleClearSceneForm();
      await loadScenes();
    }
  };


  // 1. 本文からシーン設定を抽出 (Gemini 3.6 Flash)
  const handleExtractSituation = async () => {
    if (!sceneText) {
      alert('小説の本文テキストを入力してください。');
      return;
    }
    if (!apiKey) {
      alert('Google AI Studio の APIキーを入力してください。');
      return;
    }

    const selectedChars = characterList
      .filter(c => c.id && selectedCharIds.includes(c.id))
      .map(c => ({ name: c.name, visual: c.characterVisual, profile: c.characterProfile }));

    setIsExtractingSituation(true);
    try {
      const situationMD = await extractSceneSituation(sceneText, selectedChars, apiKey);
      setAiSituation(situationMD);

      const now = new Date();
      let sceneId = currentSceneId;
      const sName = sceneName || '無題のシーン';
      if (!sceneId) {
        sceneId = crypto.randomUUID();
        const sceneData: Scene = {
          id: sceneId,
          novelId: selectedNovelId || undefined,
          name: sName,
          text: sceneText,
          characterIds: selectedCharIds,
          aiSituation: situationMD,
          createdAt: now,
          updatedAt: now
        };
        await db.scenes.put(sceneData);
        setCurrentSceneId(sceneId);
        setSceneCreatedAt(now);
        localStorage.setItem('sashie_selected_scene_id', sceneId);
      } else {
        await db.scenes.update(sceneId, {
          name: sName,
          text: sceneText,
          characterIds: selectedCharIds,
          aiSituation: situationMD,
          updatedAt: now
        });
      }

      setSceneUpdatedAt(now);
      await loadScenes();
    } catch (err: any) {
      alert(`シーン解析エラー: ${err.message}`);
    } finally {
      setIsExtractingSituation(false);
    }
  };


  // 2. 挿絵を生成 (NanobananaPro / gemini-3-pro-image-preview) - 4構図同時並列生成
  const handleGenerateIllustration = async () => {
    if (!apiKey) {
      alert('Google AI Studio の APIキーを入力してください。');
      return;
    }
    if (!aiSituation) {
      alert('シーン設定Markdownを入力してください。');
      return;
    }

    setIsGeneratingImage(true);
    setGeneratedBatch([]);
    try {
      const selectedChars = characterList
        .filter(c => c.id && selectedCharIds.includes(c.id))
        .map(c => {
          const charImgs: string[] = [];
          if (c.images?.input) charImgs.push(c.images.input);
          else if ((c as any).image) charImgs.push((c as any).image);
          if (c.images?.front) charImgs.push(c.images.front);
          if (c.images?.side) charImgs.push(c.images.side);

          return {
            name: c.name,
            visual: c.characterVisual,
            images: charImgs
          };
        });

      const compositions: Array<{ type: 'rule_of_thirds' | 'center_bullseye' | 'triangle_pyramid' | 'diagonal_lines'; label: string }> = [
        { type: 'rule_of_thirds', label: '① 三分割構図 (Rule of Thirds)' },
        { type: 'center_bullseye', label: '② 日の丸構図 (Center)' },
        { type: 'triangle_pyramid', label: '③ 三角形構図 (Triangle)' },
        { type: 'diagonal_lines', label: '④ 対角線構図 (Diagonal)' }
      ];

      // 4構図を並列で同時生成
      const results = await Promise.all(
        compositions.map(async (comp) => {
          const base64 = await generateIllustration(aiSituation, selectedChars, aspectRatio, comp.type, apiKey);
          return { angle: comp.type, angleLabel: comp.label, image: base64 };
        })
      );

      setGeneratedBatch(results);

      // 生成した4枚の画像をすべて自動で保存する
      const now = new Date();
      let sceneId = currentSceneId;
      const sName = sceneName || '無題のシーン';

      if (!sceneId) {
        sceneId = crypto.randomUUID();
        const sceneData: Scene = {
          id: sceneId,
          novelId: selectedNovelId || undefined,
          name: sName,
          text: sceneText,
          characterIds: selectedCharIds,
          aiSituation,
          createdAt: now,
          updatedAt: now
        };
        await db.scenes.put(sceneData);
        setCurrentSceneId(sceneId);
        setSceneCreatedAt(now);
        localStorage.setItem('sashie_selected_scene_id', sceneId);
      } else {
        await db.scenes.update(sceneId, {
          name: sName,
          text: sceneText,
          characterIds: selectedCharIds,
          aiSituation,
          updatedAt: now
        });
      }
      setSceneUpdatedAt(now);
      await loadScenes();

      // 4枚すべての画像を GeneratedImages に書き込む
      for (const res of results) {
        const imgData: GeneratedImage = {
          id: crypto.randomUUID(),
          sceneId: sceneId,
          image: res.image,
          createdAt: now,
          updatedAt: now
        };
        await db.generatedImages.put(imgData);
      }

      // 履歴ロード
      const history = await db.generatedImages.where('sceneId').equals(sceneId).reverse().sortBy('createdAt');
      setHistoryImages(history);
      setSelectedImage(results[0].image); // デフォルトで1つ目の画像を表示

      alert('4つの構図の挿絵が同時に生成され、すべて自動でシーンに保存されました！');
    } catch (err: any) {
      alert(`挿絵生成エラー: ${err.message}`);
    } finally {
      setIsGeneratingImage(false);
    }
  };




  // キャラクター立ち絵ダウンロード
  const handleDownloadCharacterImage = () => {
    if (!charImageBase64) return;
    const a = document.createElement('a');
    a.href = charImageBase64;
    const name = charName ? `${charName}_${charPoseAngle}` : `character_${charPoseAngle}`;
    a.download = `${name}_${Date.now()}.png`;
    a.click();
  };

  // 3. PCへダウンロード

  const handleDownloadImage = () => {
    if (!selectedImage) return;
    const a = document.createElement('a');
    a.href = selectedImage;
    a.download = `illustration_${Date.now()}.png`;
    a.click();
  };

  return (
    <>
      {/* アプリケーションヘッダー */}
      <header className="app-header">
        <div className="app-title" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span>🎨 挿絵メーカー</span>
          <select
            className="novel-select"
            style={{
              backgroundColor: 'var(--bg-input)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-main)',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '0.85rem',
              cursor: 'pointer',
              outline: 'none',
              marginLeft: '8px'
            }}
            value={selectedNovelId || ''}
            onChange={(e) => handleSelectNovel(e.target.value)}
          >
            {novelList.map(n => (
              <option key={n.id} value={n.id}>
                📚 {n.title}
              </option>
            ))}
          </select>
          <button
            className="btn btn-secondary"
            style={{
              padding: '6px 12px',
              fontSize: '0.80rem',
              whiteSpace: 'nowrap'
            }}
            onClick={() => {
              handleClearNovelForm();
              handleTabChange('novel');
            }}
          >
            ＋ 新規小説を作成
          </button>
        </div>

        <nav className="nav-tabs">
          <button
            className={`tab-button ${activeTab === 'character' ? 'active' : ''}`}
            onClick={() => handleTabChange('character')}
          >
            👤 キャラクター管理
          </button>
          <button
            className={`tab-button ${activeTab === 'scene' ? 'active' : ''}`}
            onClick={() => handleTabChange('scene')}
          >
            🎬 シーン・挿絵生成
          </button>
        </nav>

        <div className="api-key-input-wrap">
          <span className="form-label" style={{ color: '#aaa' }}>API Key:</span>
          <input
            type="password"
            className="api-key-input"
            placeholder="Google AI Studio Key"
            value={apiKey}
            onChange={handleApiKeyChange}
          />
        </div>
      </header>

      {/* メイン画面領域 */}
      <main className="main-content">
        {/* ---------- タブ0: 小説管理画面 ---------- */}
        {activeTab === 'novel' && (
          <div className="dashboard-grid-3" style={{ gridTemplateColumns: '1fr 2fr' }}>
            {/* 左側: 新規登録 & 編集 */}
            <section className="panel-card">
              <div className="panel-header">
                <span>【小説の設定・編集】</span>
                {selectedNovelId && (
                  <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem' }} onClick={handleClearNovelForm}>
                    新規作成モードへ
                  </button>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">◆ 小説タイトル</label>
                <input
                  type="text"
                  className="text-input"
                  placeholder="例: AI事務員宮西さん"
                  value={novelTitle}
                  onChange={e => setNovelTitle(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <label className="form-label">◆ あらすじ・概要・メモ</label>
                <textarea
                  className="textarea-input"
                  style={{ flex: 1, minHeight: '300px' }}
                  placeholder="例: AIが人間のオフィスの様々な課題を解決していくコメディストーリー。..."
                  value={novelDescription}
                  onChange={e => setNovelDescription(e.target.value)}
                />
              </div>

              <button
                className="btn btn-primary"
                onClick={handleSaveNovel}
                style={{ marginTop: '12px' }}
              >
                小説プロジェクトを保存
              </button>
            </section>

            {/* 右側: 登録済みの小説一覧 */}
            <section className="panel-card">
              <div className="panel-header">
                <span>【小説プロジェクト一覧】</span>
                <span className="timestamp-badge">{novelList.length} 作</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px', overflowY: 'auto' }}>
                {novelList.map(novel => (
                  <div
                    key={novel.id}
                    onClick={() => handleSelectNovel(novel.id!)}
                    style={{
                      border: selectedNovelId === novel.id ? '2px solid var(--primary-color)' : '1px solid var(--border-color)',
                      borderRadius: '8px',
                      padding: '16px',
                      background: selectedNovelId === novel.id ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.02)',
                      cursor: 'pointer',
                      position: 'relative',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      minHeight: '130px',
                      transition: 'border-color 0.2s, background 0.2s'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 'bold', fontSize: '1.1rem', color: selectedNovelId === novel.id ? 'var(--primary-color)' : '#fff' }}>
                        📚 {novel.title}
                      </span>
                      <button
                        className="btn btn-danger"
                        style={{ padding: '2px 8px', fontSize: '0.7rem' }}
                        onClick={(e) => handleDeleteNovel(novel.id!, e)}
                      >
                        削除
                      </button>
                    </div>

                    <p style={{
                      fontSize: '0.8rem',
                      color: 'var(--text-muted)',
                      margin: '4px 0',
                      lineHeight: '1.4',
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden'
                    }}>
                      {novel.description || '(概要・メモはありません)'}
                    </p>

                    <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: '#666' }}>
                      <span>作成: {new Date(novel.createdAt).toLocaleDateString('ja-JP')}</span>
                      <span>更新: {new Date(novel.updatedAt).toLocaleDateString('ja-JP')}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* ---------- タブ1: キャラクター管理画面 ---------- */}
        {activeTab === 'character' && (
          <div className="dashboard-grid-3">
            {/* 左側: 新規登録 & 立ち絵アップロード */}
            <section className="panel-card">
              <div className="panel-header">
                <span>【新規登録・画像】</span>
                {selectedCharId && (
                  <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem' }} onClick={handleClearCharForm}>
                    + 新規作成
                  </button>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">キャラクター名</label>
                <input
                  type="text"
                  className="text-input"
                  placeholder="例: リク (Riku)"
                  value={charName}
                  onChange={e => setCharName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">立ち絵画像 (PNG / JPG)</label>
                <div
                  className="upload-dropzone"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                >

                  {charImageBase64 ? (
                    <img src={charImageBase64} alt="Preview" className="upload-preview-img" />
                  ) : (
                    <p style={{ color: '#aaa', fontSize: '0.85rem' }}>
                      クリックまたはドラッグ＆ドロップで<br />立ち絵画像を選択
                    </p>
                  )}
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleImageUpload}
                  />
                </div>
              </div>

              <button
                className="btn btn-secondary"
                onClick={handleAnalyzeVisual}
                disabled={isAnalyzingChar || !charImageBase64}
              >
                {isAnalyzingChar ? <span className="spinner"></span> : '1. AI設定読み込み (外見解析)'}
              </button>

              <button
                className="btn btn-success"
                onClick={handleDownloadCharacterImage}
                disabled={!charImageBase64}
                style={{ marginTop: '8px' }}
              >
                立ち絵をPCへダウンロード
              </button>

              <button
                className="btn btn-primary"
                onClick={handleSaveCharacter}
                disabled={isGeneratingPose}
                style={{ marginTop: 'auto' }}
              >
                {isGeneratingPose ? (
                  <>
                    <span className="spinner"></span> 2. 保存中 (正面・横向き自動生成中...)
                  </>
                ) : (
                  '2. キャラクターを保存'
                )}
              </button>
            </section>




            {/* 中央: キャラクター設定Markdownエディタ (Visual & Profile) */}
            <section className="panel-card">
              <div className="panel-header">
                <span>【キャラクター設定エディタ】</span>
                {charUpdatedAt && (
                  <span className="timestamp-badge">
                    更新: {new Date(charUpdatedAt).toLocaleString('ja-JP')}
                  </span>
                )}
              </div>

              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">◆ 外見特徴 (Visual: AI自動抽出 & 編集)</label>
                <textarea
                  className="textarea-input textarea-code"
                  style={{ height: '200px' }}
                  value={charVisual}
                  onChange={e => setCharVisual(e.target.value)}
                  placeholder={INITIAL_VISUAL_TEMPLATE('リク')}
                />
              </div>

              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">◆ 詳細プロフィール (Profile: ユーザー手動記述)</label>
                <textarea
                  className="textarea-input textarea-code"
                  style={{ height: '220px' }}
                  value={charProfile}
                  onChange={e => setCharProfile(e.target.value)}
                  placeholder={INITIAL_PROFILE_TEMPLATE('リク')}
                />
              </div>

              {selectedCharId && (
                <div className="form-group" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px', marginTop: '12px' }}>
                  <label className="form-label" style={{ marginBottom: '8px', display: 'block' }}>🎥 ポーズ画像ライブラリ (表示切り替え)</label>
                  <div style={{ display: 'flex', gap: '16px' }}>
                    
                    {/* 1. インプット元画像 */}
                    <div style={{ flex: 1, textAlign: 'center', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', padding: '10px', border: '1px solid var(--border-color)' }}>
                      <span style={{ fontSize: '0.75rem', color: '#aaa', display: 'block', marginBottom: '6px' }}>インプット (元画像)</span>
                      {charImages.input ? (
                        <img src={charImages.input} alt="Input Pose" style={{ width: '100%', height: '120px', objectFit: 'contain', cursor: 'pointer', borderRadius: '4px' }} onClick={() => handlePoseAngleChange('input')} />
                      ) : (
                        <div style={{ height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', color: '#666' }}>なし</div>
                      )}
                      <button className={`btn btn-secondary ${charPoseAngle === 'input' ? 'active' : ''}`} style={{ marginTop: '8px', fontSize: '0.75rem', width: '100%', padding: '4px 0' }} onClick={() => handlePoseAngleChange('input')}>
                        表示切り替え
                      </button>
                    </div>

                    {/* 2. 正面ポーズ */}
                    <div style={{ flex: 1, textAlign: 'center', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', padding: '10px', border: '1px solid var(--border-color)' }}>
                      <span style={{ fontSize: '0.75rem', color: '#aaa', display: 'block', marginBottom: '6px' }}>正面</span>
                      {charImages.front ? (
                        <img src={charImages.front} alt="Front Pose" style={{ width: '100%', height: '120px', objectFit: 'contain', cursor: 'pointer', borderRadius: '4px' }} onClick={() => handlePoseAngleChange('front')} />
                      ) : (
                        <div style={{ height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', color: '#666', border: '1px dashed var(--border-color)', borderRadius: '4px' }}>保存時に自動生成</div>
                      )}
                      <button
                        className={`btn btn-secondary ${charPoseAngle === 'front' ? 'active' : ''}`}
                        style={{ marginTop: '8px', fontSize: '0.75rem', width: '100%', padding: '4px 0' }}
                        disabled={!charImages.front}
                        onClick={() => handlePoseAngleChange('front')}
                      >
                        表示切り替え
                      </button>
                    </div>

                    {/* 3. 横向きポーズ */}
                    <div style={{ flex: 1, textAlign: 'center', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', padding: '10px', border: '1px solid var(--border-color)' }}>
                      <span style={{ fontSize: '0.75rem', color: '#aaa', display: 'block', marginBottom: '6px' }}>横向き</span>
                      {charImages.side ? (
                        <img src={charImages.side} alt="Side Pose" style={{ width: '100%', height: '120px', objectFit: 'contain', cursor: 'pointer', borderRadius: '4px' }} onClick={() => handlePoseAngleChange('side')} />
                      ) : (
                        <div style={{ height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', color: '#666', border: '1px dashed var(--border-color)', borderRadius: '4px' }}>保存時に自動生成</div>
                      )}
                      <button
                        className={`btn btn-secondary ${charPoseAngle === 'side' ? 'active' : ''}`}
                        style={{ marginTop: '8px', fontSize: '0.75rem', width: '100%', padding: '4px 0' }}
                        disabled={!charImages.side}
                        onClick={() => handlePoseAngleChange('side')}
                      >
                        表示切り替え
                      </button>
                    </div>

                  </div>
                </div>
              )}
            </section>


            {/* 右側: キャラクターライブラリ一覧 */}
            <section className="panel-card">
              <div className="panel-header">
                <span>【キャラライブラリ】</span>
                <span className="timestamp-badge">{characterList.length} 件</span>
              </div>

              <div className="character-grid">
                {characterList.map(char => (
                  <div
                    key={char.id}
                    className={`character-card ${selectedCharId === char.id ? 'active' : ''}`}
                    onClick={() => handleSelectCharacter(char)}
                  >
                    <img src={char.images?.input || (char as any).image || ''} alt={char.name} className="character-card-img" />

                    <div className="character-card-name">{char.name}</div>
                    <button
                      className="btn btn-danger"
                      style={{ padding: '2px 6px', fontSize: '0.7rem', marginTop: '4px', width: '100%' }}
                      onClick={e => handleDeleteCharacter(char.id!, e)}
                    >
                      削除
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* ---------- タブ2: シーン・挿絵生成画面 ---------- */}
        {activeTab === 'scene' && (
          <div className="dashboard-grid-3">
            {/* 左側ペイン: 小説本文 & キャラクター選択 */}
            <section className="panel-card" style={{ overflowY: 'auto' }}>
              <div className="panel-header">
                <span>【シーン情報入力】</span>
                {currentSceneId && (
                  <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem' }} onClick={handleClearSceneForm}>
                    + 新規作成
                  </button>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">シーン名</label>
                <input
                  type="text"
                  className="text-input"
                  placeholder="例: 第一章 宿敵との対峙"
                  value={sceneName}
                  onChange={e => setSceneName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">小説本文 (シーンテキスト)</label>

                <textarea
                  className="textarea-input"
                  style={{ height: '140px' }}
                  placeholder="「あいつが来るぞ！」リクは剣を構えた。森の奥から暗闇が迫る..."
                  value={sceneText}
                  onChange={e => setSceneText(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">登場キャラクター選択</label>
                <div className="character-select-group">
                  {characterList.map(char => (
                    <label key={char.id} className="character-checkbox-label">
                      <input
                        type="checkbox"
                        checked={selectedCharIds.includes(char.id!)}
                        onChange={() => handleToggleCharSelect(char.id!)}
                      />
                      {char.name}
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">アスペクト比</label>
                <div style={{ display: 'flex', gap: '16px', margin: '6px 0' }}>
                  <label style={{ cursor: 'pointer', fontSize: '0.85rem' }}>
                    <input
                      type="radio"
                      name="aspect"
                      value="2:3"
                      checked={aspectRatio === '2:3'}
                      onChange={() => setAspectRatio('2:3')}
                    />{' '}
                    2:3 (ラノベ縦型標準)
                  </label>
                  <label style={{ cursor: 'pointer', fontSize: '0.85rem' }}>
                    <input
                      type="radio"
                      name="aspect"
                      value="3:4"
                      checked={aspectRatio === '3:4'}
                      onChange={() => setAspectRatio('3:4')}
                    />{' '}
                    3:4 (標準縦型)
                  </label>
                </div>
              </div>

              <button
                className="btn btn-secondary"
                onClick={handleExtractSituation}
                disabled={isExtractingSituation || !sceneText}
                style={{ marginTop: 'auto', marginBottom: '14px' }}
              >
                {isExtractingSituation ? <span className="spinner"></span> : '1. 本文からシーン設定をAI抽出 (Gemini 3.6)'}
              </button>

              <div className="form-group" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '14px' }}>
                <label className="form-label" style={{ marginBottom: '8px', display: 'block' }}>🎥 過去のシーンライブラリ ({sceneList.length})</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {sceneList.map(scene => (
                    <div
                      key={scene.id}
                      className={`character-card ${currentSceneId === scene.id ? 'active' : ''}`}
                      style={{ textAlign: 'left', padding: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                      onClick={() => handleSelectScene(scene)}
                    >
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {scene.name || '無題のシーン'}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '2px' }}>
                          {scene.text}
                        </div>
                        <div style={{ fontSize: '0.65rem', color: '#666', marginTop: '2px' }}>
                          {new Date(scene.updatedAt).toLocaleString('ja-JP')}
                        </div>
                      </div>

                      <button
                        className="btn btn-danger"
                        style={{ padding: '2px 8px', fontSize: '0.7rem', marginLeft: '10px' }}
                        onClick={e => handleDeleteScene(scene.id!, e)}
                      >
                        削除
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* 中央ペイン: シーン設定Markdown & 画像生成 */}
            <section className="panel-card">
              <div className="panel-header">
                <span>【シーン設定エディタ】</span>
                {sceneUpdatedAt && (
                  <span className="timestamp-badge">
                    更新: {new Date(sceneUpdatedAt).toLocaleString('ja-JP')}
                  </span>
                )}
              </div>

              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">シーン設定Markdown (自由微調整可能)</label>
                <textarea
                  className="textarea-input textarea-code"
                  style={{ height: 'calc(100% - 100px)' }}
                  value={aiSituation}
                  onChange={e => setAiSituation(e.target.value)}
                />
              </div>

              <button
                className="btn btn-primary"
                onClick={handleGenerateIllustration}
                disabled={isGeneratingImage || !aiSituation}
                style={{ padding: '12px 20px', fontSize: '1rem', marginTop: 'auto' }}
              >
                {isGeneratingImage ? <span className="spinner"></span> : '2. 挿絵を生成 (NanobananaPro)'}
              </button>
            </section>

            {/* 右側ペイン: プレビュー & 履歴 ＆ シーンライブラリ */}
            <section className="panel-card">
              <div className="panel-header">
                <span>【プレビュー & ライブラリ】</span>
              </div>

              <div className="image-preview-frame" style={{ aspectRatio: '3 / 4', maxHeight: '240px' }}>
                {selectedImage ? (
                  <img src={selectedImage} alt="Generated Illustration" />
                ) : (
                  <span style={{ color: '#666', fontSize: '0.8rem', padding: '10px', textAlign: 'center' }}>
                    [ 生成された挿絵画像 ]
                  </span>
                )}
              </div>

              {/* 4アングル同時生成結果の2x2グリッド */}
              {generatedBatch.length > 0 && (
                <div className="form-group" style={{ marginTop: '10px' }}>
                  <label className="form-label" style={{ marginBottom: '6px', display: 'block' }}>🎬 同時生成された4つの構図 (クリックで切替)</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    {generatedBatch.map(item => (
                      <div
                        key={item.angle}
                        style={{
                          border: selectedImage === item.image ? '2px solid var(--primary-color)' : '1px solid var(--border-color)',
                          borderRadius: '6px',
                          padding: '4px',
                          cursor: 'pointer',
                          background: 'rgba(255,255,255,0.02)',
                          textAlign: 'center'
                        }}
                        onClick={() => setSelectedImage(item.image)}
                      >
                        <img src={item.image} alt={item.angleLabel} style={{ width: '100%', height: '80px', objectFit: 'contain', borderRadius: '4px' }} />
                        <span style={{ fontSize: '0.65rem', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '2px', color: 'var(--text-muted)' }}>
                          {item.angleLabel.split(' ')[1] || item.angleLabel}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button
                className="btn btn-success"
                onClick={handleDownloadImage}
                disabled={!selectedImage}
                style={{ width: '100%', marginTop: '10px' }}
              >
                3. PCへダウンロード
              </button>

              {/* 生成履歴サムネイルリスト */}
              {historyImages.length > 0 && (
                <div className="form-group" style={{ marginTop: '14px' }}>
                  <label className="form-label" style={{ marginBottom: '6px', display: 'block' }}>🎥 確定保存済みの履歴 ({historyImages.length} 枚)</label>
                  <div className="history-thumbnails">
                    {historyImages.map(img => (
                      <div
                        key={img.id}
                        className={`history-thumb-item ${selectedImage === img.image ? 'active' : ''}`}
                        onClick={() => setSelectedImage(img.image)}
                        title={`生成日時: ${new Date(img.createdAt).toLocaleString('ja-JP')}`}
                      >
                        <img src={img.image} alt="History Thumb" />
                      </div>
                    ))}
                  </div>
                </div>
              )}            </section>
          </div>
        )}

      </main>
    </>
  );
}
