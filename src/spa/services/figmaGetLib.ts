import * as fs from 'fs/promises';
import * as path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

const FIGMA_API_BASE = 'https://api.figma.com/v1';

/**
 * Универсальная функция для выполнения запросов к Figma REST API с retry
 */
async function figmaRequest<T>(
	endpoint: string,
	token: string,
	options: RequestInit = {},
	maxRetries: number = 3
): Promise<T> {
	const url = endpoint.startsWith('http') ? endpoint : `${FIGMA_API_BASE}${endpoint}`;
	
	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			const response = await fetch(url, {
				...options,
				headers: {
					'X-Figma-Token': token,
					'Content-Type': 'application/json',
					...(options.headers || {}),
				},
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(
					`Figma API error: ${response.status} ${response.statusText}\n${errorText}`
				);
			}

			return response.json() as Promise<T>;
		} catch (error: any) {
			if (attempt === maxRetries) {
				throw error;
			}
			
			// Exponential backoff: 1s, 2s, 4s
			const delay = Math.pow(2, attempt) * 1000;
			await new Promise(resolve => setTimeout(resolve, delay));
		}
	}
	
	throw new Error('Max retries exceeded');
}

/**
 * Скачивание файла по URL с сохранением на диск и retry
 */
async function downloadFile(url: string, outputPath: string, maxRetries: number = 3): Promise<void> {
	await fs.mkdir(path.dirname(outputPath), { recursive: true });

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			const response = await fetch(url);
			if (!response.ok || !response.body) {
				throw new Error(`Failed to download file from ${url}: ${response.statusText}`);
			}

			const nodeStream = Readable.fromWeb(response.body as any);
			const fileStream = await fs.open(outputPath, 'w');

			try {
				await pipeline(nodeStream, fileStream.createWriteStream());
			} finally {
				await fileStream.close();
			}
			
			return;
		} catch (error: any) {
			if (attempt === maxRetries) {
				throw error;
			}
			
			// Exponential backoff: 1s, 2s, 4s
			const delay = Math.pow(2, attempt) * 1000;
			await new Promise(resolve => setTimeout(resolve, delay));
		}
	}
	
	throw new Error('Max retries exceeded');
}

/**
 * Утилитарная функция для генерации безопасного имени файла
 */
function sanitizeFileName(name: string): string {
	return name.replace(/[^a-z0-9_\-]/gi, '_').substring(0, 100);
}

// ============================================================================
// Публичные методы
// ============================================================================

/**
 * Получение JSON-представления файла (дерево узлов) и сохранение его на диск
 */
export async function getFigmaFileJson(
	fileKey: string,
	token: string,
	outputPath: string,
	options: { geometry?: boolean; pluginData?: boolean } = {}
): Promise<string> {
	const params = new URLSearchParams();
	if (options.geometry) {
		params.append('geometry', 'paths');
	}
	if (options.pluginData) {
		params.append('plugin_data', 'shared');
	}

	const queryString = params.toString() ? `?${params.toString()}` : '';
	const data = await figmaRequest<any>(
		`/files/${fileKey}${queryString}`,
		token
	);

	await fs.mkdir(path.dirname(outputPath), { recursive: true });
	const jsonString = JSON.stringify(data);
	await fs.writeFile(outputPath, jsonString, 'utf-8');

	return outputPath;
}

/**
 * Получение изображений из файла и их скачивание с поддержкой батчинга и rate limiting
 */
export async function getFigmaImages(
	fileKey: string,
	token: string,
	nodeIds: string[],
	outputDir: string,
	options: {
		format?: 'jpg' | 'png' | 'svg' | 'pdf';
		scale?: number;
		svgIncludeId?: boolean;
		contentsOnly?: boolean;
	} = {},
	onProgress?: (batchIndex: number, totalBatches: number, downloadedCount: number, totalCount: number) => void
): Promise<string[]> {
	if (nodeIds.length === 0) {
		throw new Error('nodeIds array cannot be empty');
	}

	// Разбиваем на батчи по 100 ID
	const batchSize = 100;
	const batches: string[][] = [];
	for (let i = 0; i < nodeIds.length; i += batchSize) {
		batches.push(nodeIds.slice(i, i + batchSize));
	}

	await fs.mkdir(outputDir, { recursive: true });

	const savedPaths: string[] = [];
	let totalDownloaded = 0;

	for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
		const batch = batches[batchIndex];
		
		if (onProgress) {
			onProgress(batchIndex + 1, batches.length, totalDownloaded, nodeIds.length);
		}

		const params = new URLSearchParams();
		params.append('ids', batch.join(','));
		if (options.format) {
			params.append('format', options.format);
		}
		if (options.scale !== undefined) {
			params.append('scale', options.scale.toString());
		}
		if (options.svgIncludeId !== undefined) {
			params.append('svg_include_id', options.svgIncludeId.toString());
		}
		if (options.contentsOnly !== undefined) {
			params.append('contents_only', options.contentsOnly.toString());
		}

		const data = await figmaRequest<{
			images: Record<string, string | null>;
			err?: string;
		}>(`/images/${fileKey}?${params.toString()}`, token);

		if (data.err) {
			throw new Error(`Figma images API error: ${data.err}`);
		}

		// Скачиваем изображения последовательно, чтобы не перегружать сеть
		for (const [nodeId, imageUrl] of Object.entries(data.images)) {
			if (!imageUrl) {
				continue;
			}

			const extension = options.format || 'png';
			const fileName = `${sanitizeFileName(nodeId)}.${extension}`;
			const outputPath = path.join(outputDir, fileName);

			await downloadFile(imageUrl, outputPath);
			savedPaths.push(outputPath);
			totalDownloaded++;
		}

		// Задержка между батчами (500ms) для rate limiting
		if (batchIndex < batches.length - 1) {
			await new Promise(resolve => setTimeout(resolve, 500));
		}
	}

	if (onProgress) {
		onProgress(batches.length, batches.length, totalDownloaded, nodeIds.length);
	}

	return savedPaths;
}

/**
 * Получение локальных переменных (дизайн-токенов) из файла
 */
export async function getFigmaVariables(
	fileKey: string,
	token: string,
	outputPath: string
): Promise<string> {
	const data = await figmaRequest<any>(
		`/files/${fileKey}/variables/local`,
		token
	);

	await fs.mkdir(path.dirname(outputPath), { recursive: true });
	await fs.writeFile(outputPath, JSON.stringify(data), 'utf-8');

	return outputPath;
}

/**
 * Получение стилей из файла
 */
export async function getFigmaStyles(
	fileKey: string,
	token: string,
	outputPath: string
): Promise<string> {
	const data = await figmaRequest<any>(
		`/files/${fileKey}/styles`,
		token
	);

	await fs.mkdir(path.dirname(outputPath), { recursive: true });
	await fs.writeFile(outputPath, JSON.stringify(data), 'utf-8');

	return outputPath;
}

/**
 * Получение комментариев из файла
 */
export async function getFigmaComments(
	fileKey: string,
	token: string,
	outputPath: string
): Promise<string> {
	const data = await figmaRequest<any>(
		`/files/${fileKey}/comments`,
		token
	);

	await fs.mkdir(path.dirname(outputPath), { recursive: true });
	await fs.writeFile(outputPath, JSON.stringify(data), 'utf-8');

	return outputPath;
}

/**
 * Получение списка версий файла
 */
export async function getFigmaVersions(
	fileKey: string,
	token: string,
	outputPath: string
): Promise<string> {
	const data = await figmaRequest<any>(
		`/files/${fileKey}/versions`,
		token
	);

	await fs.mkdir(path.dirname(outputPath), { recursive: true });
	await fs.writeFile(outputPath, JSON.stringify(data), 'utf-8');

	return outputPath;
}

/**
 * Комплексный метод: получение всего макета (JSON + изображения + переменные)
 */
export async function downloadFigmaLayout(
	fileKey: string,
	token: string,
	outputDir: string,
	nodeIds?: string[]
): Promise<{
	fileJson: string;
	variables: string;
	styles: string;
	images: string[];
}> {
	await fs.mkdir(outputDir, { recursive: true });

	const [fileJson, variables, styles] = await Promise.all([
		getFigmaFileJson(fileKey, token, path.join(outputDir, 'file.json')),
		getFigmaVariables(fileKey, token, path.join(outputDir, 'variables.json')),
		getFigmaStyles(fileKey, token, path.join(outputDir, 'styles.json')),
	]);

	let images: string[] = [];
	if (nodeIds && nodeIds.length > 0) {
		images = await getFigmaImages(
			fileKey,
			token,
			nodeIds,
			path.join(outputDir, 'images'),
			{ format: 'png', scale: 2 }
		);
	}

	return { fileJson, variables, styles, images };
}