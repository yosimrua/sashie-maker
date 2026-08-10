// Google AI Studio (Gemini API & NanobananaPro API) との通信モジュール

// テンプレート固定文字列の定義
export const INITIAL_VISUAL_TEMPLATE = (name: string) => `# ${name} - 外見特徴
## 1. 基本ビジュアル
- 性別: 

## 2. 詳細ビジュアル
- 髪型・髪色: 
- 瞳の色: 
- 服装: 
- その他特徴: 
`;

export const INITIAL_PROFILE_TEMPLATE = (name: string) => `# ${name} - 詳細設定
## 1. プロフィール
- 年齢 / 外見年齢: 
- 職業 / 役割: 

## 2. キャラクター性
- 性格: 
- 武器・能力: 
- その他補足: 
`;

export const INITIAL_SITUATION_TEMPLATE = `# シーン設定概要
## 1. 登場人物と状態
- 登場キャラクター: 
- 各キャラの表情: 
- 各キャラのポーズ・アクション: 

## 2. 構図・カメラワーク
- カメラアングル: 
- キャラクターの配置: 
- 視線の方向: 

## 3. 背景・環境
- 場所・環境: 
- 時間帯・天候: 
- 光源・ライティング: 
- 全体の雰囲気: 
`;

/**
 * 立ち絵画像から外見特徴Markdownを自動抽出 (Gemini 3.6 Flash)
 */
export async function analyzeCharacterVisual(
  imageBase64: string,
  characterName: string,
  apiKey: string
): Promise<string> {
  const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const mimeType = imageBase64.match(/^data:(image\/\w+);base64,/)?.[1] || 'image/png';

  const systemPrompt = `あなたはライトノベルのキャラクターデザイナーです。
提供された立ち絵画像から、キャラクターの外見特徴を正確に読み取り、指定のMarkdown形式で出力してください。

【厳格な出力形式】
# ${characterName} - 外見特徴
## 1. 基本ビジュアル
- 性別: [読み取った性別]
## 2. 詳細ビジュアル
- 髪型・髪色: [髪型や色の詳細]
- 瞳の色: [瞳の色や形]
- 服装: [着用している衣装・アクセサリーの詳細]
- その他特徴: [体型や目立つ特徴]
`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,

      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: systemPrompt },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: cleanBase64
                  }
                }
              ]
            }
          ]
        })
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`APIエラー (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return resultText || INITIAL_VISUAL_TEMPLATE(characterName);
  } catch (error) {
    console.error('Character Visual Analysis Error:', error);
    throw error;
  }
}

/**
 * 小説本文とキャラクター設定からシーン設定Markdownを自動抽出 (Gemini 3.6 Flash)
 */
export async function extractSceneSituation(
  sceneText: string,
  characters: Array<{ name: string; visual: string; profile: string }>,
  apiKey: string
): Promise<string> {
  const charContext = characters
    .map(c => `【キャラクター名: ${c.name}】\n[外見情報]\n${c.visual}\n[設定情報]\n${c.profile}`)
    .join('\n\n');

  const systemPrompt = `あなたはライトノベルの挿絵ディレクターです。
以下の「小説本文」と「登場キャラクター情報」を読み込み、挿絵生成に最適なシチュエーションを抽出し、指定のMarkdown形式で出力してください。

【登場キャラクター情報】
${charContext}

【小説本文】
${sceneText}

【厳格な出力形式】
# シーン設定概要
## 1. 登場人物と状態
- 登場キャラクター: [登場する人物名]
- 各キャラの表情: [シーン中の表情や感情]
- 各キャラのポーズ・アクション: [具体的なポーズや動き]
## 2. 構図・カメラワーク
- カメラアングル: [アップ、ロング、ローアングルなど]
- キャラクターの配置: [画面内の左右・前後の配置]
- 視線の方向: [どこを見ているか]
## 3. 背景・環境
- 場所・環境: [部屋、森、街並みなどの具体的情景]
- 時間帯・天候: [昼、夜、雨など]
- 光源・ライティング: [太陽光、逆光、月光、炎など]
- 全体の雰囲気: [シリアス、緊迫、日常、感動など]
`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,

      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt }] }]
        })
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`APIエラー (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return resultText || INITIAL_SITUATION_TEMPLATE;
  } catch (error) {
    console.error('Scene Situation Extraction Error:', error);
    throw error;
  }
}

/**
 * NanobananaPro (gemini-3-pro-image-preview) による挿絵生成
 */
export async function generateIllustration(
  aiSituation: string,
  characters: Array<{ name: string; visual: string; images: string[] }>,
  aspectRatio: '2:3' | '3:4' | '1:1' | '16:9',
  compositionType: 'rule_of_thirds' | 'center_bullseye' | 'triangle_pyramid' | 'diagonal_lines',
  apiKey: string
): Promise<string> {
  const charDetails = characters
    .map(c => `Character "${c.name}":\n${c.visual}`)
    .join('\n\n');

  const compositionPrompts = {
    rule_of_thirds: "Rule of thirds composition. The main characters or subjects are placed off-center, aligned with the vertical and horizontal grid lines or intersections, creating a natural, balanced, and aesthetically pleasing layout.",
    center_bullseye: "Center composition (日の丸構図 / Bullseye composition). The main character is positioned precisely at the very center of the screen, creating a powerful, clear focal point and maximum visual impact with strong presence.",
    triangle_pyramid: "Triangle composition (Pyramid composition). The characters or elements form a stable triangular shape within the frame, conveying a sense of stability, calmness, and unified grouping.",
    diagonal_lines: "Diagonal composition (Leading lines composition). The main action or characters are arranged along a diagonal line across the canvas, generating dynamic movement, depth, speed, and leading the viewer's eye."
  };

  const prompt = `High quality anime light novel illustration.

[CRITICAL REQUIREMENT: CHARACTER VISUAL IDENTITY & CONSISTENCY]
- You must strictly preserve and copy the visual identity, faces, hair styles, hair colors, clothes, and colors of the characters shown in the attached reference images.
- The characters in the generated scene must look 100% identical to the reference pictures. Do not change their hair styles, outfits, or key features.

[Scene Composition & Camera Angle]
${compositionPrompts[compositionType]}

[Scene Situation]
${aiSituation}

[Character Designs & Appearance]
${charDetails}

Aspect Ratio: ${aspectRatio}. Detailed backgrounds, vibrant colors, anime style, highly detailed.`;

  const parts: any[] = [{ text: prompt }];

  // 参照用の立ち絵画像群をすべてマルチモーダル入力としてアタッチ
  characters.forEach(c => {
    c.images.forEach(imgBase64 => {
      if (imgBase64) {
        const cleanBase64 = imgBase64.replace(/^data:image\/\w+;base64,/, '');
        const mimeType = imgBase64.match(/^data:(image\/\w+);base64,/)?.[1] || 'image/png';
        parts.push({
          inline_data: {
            mime_type: mimeType,
            data: cleanBase64
          }
        });
      }
    });
  });


  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }]
        })
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`画像生成APIエラー (${response.status}): ${errText}`);
    }

    const data = await response.json();
    
    // 生成画像データの抽出 (inlineData または inline_data を探す)
    const candidateParts = data.candidates?.[0]?.content?.parts || [];
    for (const part of candidateParts) {
      const inlineData = part.inlineData || part.inline_data;
      if (inlineData && inlineData.data) {
        const mimeType = inlineData.mimeType || inlineData.mime_type || 'image/png';
        return `data:${mimeType};base64,${inlineData.data}`;
      }
    }


    throw new Error('生成結果に画像データが含まれていませんでした。');
  } catch (error) {
    console.error('Illustration Generation Error:', error);
    throw error;
  }
}

/**
 * 表情や服装を一貫させつつ、別ポーズのキャラクター立ち絵画像を生成する
 */
export async function generateCharacterPose(
  imageBase64: string,
  characterVisual: string,
  poseType: 'front' | 'side',
  apiKey: string
): Promise<string> {
  const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const mimeType = imageBase64.match(/^data:(image\/\w+);base64,/)?.[1] || 'image/png';

  const posePromptMap = {
    front: 'A front view, standing pose, full body anime character design sheet of the character. Face facing forward, symmetrical standing stance, solid pure white background (#ffffff). Maintaining identical outfit, hair style, color, and face expression as the reference image.',
    side: 'A side view, standing pose, full body anime character design sheet of the character. Facing sideways (90 degrees or profile view), solid pure white background (#ffffff). Maintaining identical outfit, hair style, color, and face expression as the reference image.'
  };

  const prompt = `Anime character illustration.
[Character Appearance Details]
${characterVisual}

[Pose Instruction]
${posePromptMap[poseType]}

High quality, crisp lines, solid pure white background, no shadows, no gradients, 2D anime style, detailed character design.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: cleanBase64
                  }
                }
              ]
            }
          ]
        })
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`画像生成APIエラー (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const candidateParts = data.candidates?.[0]?.content?.parts || [];
    for (const part of candidateParts) {
      const inlineData = part.inlineData || part.inline_data;
      if (inlineData && inlineData.data) {
        const mimeType = inlineData.mimeType || inlineData.mime_type || 'image/png';
        return `data:${mimeType};base64,${inlineData.data}`;
      }
    }

    throw new Error('生成結果に画像データが含まれていませんでした。');
  } catch (error) {
    console.error('Character Pose Generation Error:', error);
    throw error;
  }
}

