export interface Point {
  x: number;
  y: number;
}

export interface DetectionResult {
  points: Point[];
  confidence: number;
  method: string;
}

interface ImageData2D {
  data: Uint8Array;
  width: number;
  height: number;
}

export class ComicEdgeDetector {
  private readonly MAX_DETECTION_SIZE = 800;
  private readonly CONFIDENCE_THRESHOLD = 0.5;

  async detectEdges(img: HTMLImageElement): Promise<DetectionResult> {
    const startTime = performance.now();

    const detectionCanvas = document.createElement('canvas');
    const ctx = detectionCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      return this.getDefaultResult();
    }

    const scale = Math.min(
      this.MAX_DETECTION_SIZE / img.width,
      this.MAX_DETECTION_SIZE / img.height,
      1
    );
    detectionCanvas.width = Math.floor(img.width * scale);
    detectionCanvas.height = Math.floor(img.height * scale);

    ctx.drawImage(img, 0, 0, detectionCanvas.width, detectionCanvas.height);

    const imageData = ctx.getImageData(0, 0, detectionCanvas.width, detectionCanvas.height);
    const w = detectionCanvas.width;
    const h = detectionCanvas.height;

    const gray = this.toGrayscale(imageData);
    const preprocessed = this.preprocessImage(gray, w, h);

    let result: DetectionResult | null = null;

    if (performance.now() - startTime < 2000) {
      result = this.tryCannyContourDetection(preprocessed, w, h);
      if (result.confidence >= 0.7) {
        return result;
      }
    }

    if (performance.now() - startTime < 2500) {
      const houghResult = this.tryHoughLineDetection(preprocessed, w, h);
      if (houghResult.confidence > result.confidence) {
        result = houghResult;
      }
      if (result.confidence >= 0.6) {
        return result;
      }
    }

    if (performance.now() - startTime < 3000) {
      const advancedResult = this.tryAdvancedContourAnalysis(preprocessed, w, h);
      if (advancedResult.confidence > result.confidence) {
        result = advancedResult;
      }
    }

    return result.confidence >= this.CONFIDENCE_THRESHOLD
      ? result
      : this.getDefaultResult();
  }

  private toGrayscale(imageData: ImageData): Uint8Array {
    const gray = new Uint8Array(imageData.width * imageData.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      gray[i / 4] = Math.floor(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    }

    return gray;
  }

  private preprocessImage(gray: Uint8Array, w: number, h: number): ImageData2D {
    let processed = this.adaptiveHistogramEqualization(gray, w, h);
    processed = this.bilateralFilter(processed, w, h);

    return { data: processed, width: w, height: h };
  }

  private adaptiveHistogramEqualization(gray: Uint8Array, w: number, h: number): Uint8Array {
    const result = new Uint8Array(gray.length);
    const tileSize = 64;

    for (let ty = 0; ty < h; ty += tileSize) {
      for (let tx = 0; tx < w; tx += tileSize) {
        const histogram = new Array(256).fill(0);

        const endY = Math.min(ty + tileSize, h);
        const endX = Math.min(tx + tileSize, w);

        for (let y = ty; y < endY; y++) {
          for (let x = tx; x < endX; x++) {
            histogram[gray[y * w + x]]++;
          }
        }

        const cdf = new Array(256).fill(0);
        cdf[0] = histogram[0];
        for (let i = 1; i < 256; i++) {
          cdf[i] = cdf[i - 1] + histogram[i];
        }

        const pixels = (endY - ty) * (endX - tx);
        const cdfMin = cdf.find(v => v > 0) || 0;

        for (let y = ty; y < endY; y++) {
          for (let x = tx; x < endX; x++) {
            const idx = y * w + x;
            result[idx] = Math.round(((cdf[gray[idx]] - cdfMin) / (pixels - cdfMin)) * 255);
          }
        }
      }
    }

    return result;
  }

  private bilateralFilter(gray: Uint8Array, w: number, h: number): Uint8Array {
    const result = new Uint8Array(gray.length);
    const radius = 3;
    const sigmaSpace = 5;
    const sigmaColor = 50;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const centerValue = gray[idx];

        let sum = 0;
        let weightSum = 0;

        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const ny = y + dy;
            const nx = x + dx;

            if (ny >= 0 && ny < h && nx >= 0 && nx < w) {
              const nIdx = ny * w + nx;
              const neighborValue = gray[nIdx];

              const spatialDist = dx * dx + dy * dy;
              const colorDist = (centerValue - neighborValue) ** 2;

              const spatialWeight = Math.exp(-spatialDist / (2 * sigmaSpace * sigmaSpace));
              const colorWeight = Math.exp(-colorDist / (2 * sigmaColor * sigmaColor));
              const weight = spatialWeight * colorWeight;

              sum += neighborValue * weight;
              weightSum += weight;
            }
          }
        }

        result[idx] = weightSum > 0 ? Math.round(sum / weightSum) : centerValue;
      }
    }

    return result;
  }

  private tryCannyContourDetection(img: ImageData2D, w: number, h: number): DetectionResult {
    const edges = this.cannyEdgeDetection(img.data, w, h);
    const morphed = this.morphologicalClose(edges, w, h);
    const contours = this.findContours(morphed, w, h);

    if (contours.length === 0) {
      return this.getDefaultResult();
    }

    const rectangles = contours
      .map(contour => this.approximateRectangle(contour, w, h))
      .filter(rect => rect !== null);

    if (rectangles.length === 0) {
      return this.getDefaultResult();
    }

    const scored = rectangles.map(rect => ({
      rect,
      score: this.scoreRectangle(rect, w, h, edges)
    }));

    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];

    return {
      points: this.normalizePoints(best.rect, w, h),
      confidence: Math.min(best.score, 0.95),
      method: 'Canny-Contour'
    };
  }

  private cannyEdgeDetection(gray: Uint8Array, w: number, h: number): Uint8Array {
    const sobelX = new Float32Array(w * h);
    const sobelY = new Float32Array(w * h);

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;

        sobelX[idx] =
          -gray[idx - w - 1] - 2 * gray[idx - 1] - gray[idx + w - 1] +
          gray[idx - w + 1] + 2 * gray[idx + 1] + gray[idx + w + 1];

        sobelY[idx] =
          -gray[idx - w - 1] - 2 * gray[idx - w] - gray[idx - w + 1] +
          gray[idx + w - 1] + 2 * gray[idx + w] + gray[idx + w + 1];
      }
    }

    const magnitude = new Float32Array(w * h);
    const direction = new Float32Array(w * h);

    for (let i = 0; i < w * h; i++) {
      magnitude[i] = Math.sqrt(sobelX[i] ** 2 + sobelY[i] ** 2);
      direction[i] = Math.atan2(sobelY[i], sobelX[i]);
    }

    const nms = this.nonMaximumSuppression(magnitude, direction, w, h);

    const highThreshold = this.otsuThreshold(nms, w, h) * 0.9;
    const lowThreshold = highThreshold * 0.4;

    return this.hysteresisThreshold(nms, w, h, lowThreshold, highThreshold);
  }

  private otsuThreshold(data: Float32Array, w: number, h: number): number {
    const histogram = new Array(256).fill(0);
    const normalized = new Uint8Array(w * h);

    let max = 0;
    for (let i = 0; i < data.length; i++) {
      max = Math.max(max, data[i]);
    }

    for (let i = 0; i < data.length; i++) {
      normalized[i] = Math.min(255, Math.floor((data[i] / max) * 255));
      histogram[normalized[i]]++;
    }

    const total = w * h;
    let sum = 0;
    for (let i = 0; i < 256; i++) {
      sum += i * histogram[i];
    }

    let sumB = 0;
    let wB = 0;
    let wF = 0;
    let maxVariance = 0;
    let threshold = 0;

    for (let i = 0; i < 256; i++) {
      wB += histogram[i];
      if (wB === 0) continue;

      wF = total - wB;
      if (wF === 0) break;

      sumB += i * histogram[i];

      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;

      const variance = wB * wF * (mB - mF) ** 2;

      if (variance > maxVariance) {
        maxVariance = variance;
        threshold = i;
      }
    }

    return (threshold / 255) * max;
  }

  private nonMaximumSuppression(
    magnitude: Float32Array,
    direction: Float32Array,
    w: number,
    h: number
  ): Float32Array {
    const result = new Float32Array(w * h);

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        const angle = direction[idx];
        const mag = magnitude[idx];

        let n1 = 0, n2 = 0;

        const angleDeg = (angle * 180) / Math.PI;
        const normalizedAngle = ((angleDeg % 180) + 180) % 180;

        if ((normalizedAngle >= 0 && normalizedAngle < 22.5) || (normalizedAngle >= 157.5 && normalizedAngle < 180)) {
          n1 = magnitude[idx - 1];
          n2 = magnitude[idx + 1];
        } else if (normalizedAngle >= 22.5 && normalizedAngle < 67.5) {
          n1 = magnitude[idx - w - 1];
          n2 = magnitude[idx + w + 1];
        } else if (normalizedAngle >= 67.5 && normalizedAngle < 112.5) {
          n1 = magnitude[idx - w];
          n2 = magnitude[idx + w];
        } else {
          n1 = magnitude[idx - w + 1];
          n2 = magnitude[idx + w - 1];
        }

        result[idx] = (mag >= n1 && mag >= n2) ? mag : 0;
      }
    }

    return result;
  }

  private hysteresisThreshold(
    edges: Float32Array,
    w: number,
    h: number,
    low: number,
    high: number
  ): Uint8Array {
    const result = new Uint8Array(w * h);
    const strong = 255;
    const weak = 128;

    for (let i = 0; i < edges.length; i++) {
      if (edges[i] >= high) {
        result[i] = strong;
      } else if (edges[i] >= low) {
        result[i] = weak;
      }
    }

    let changed = true;
    while (changed) {
      changed = false;
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const idx = y * w + x;
          if (result[idx] === weak) {
            const hasStrong =
              result[idx - w - 1] === strong || result[idx - w] === strong || result[idx - w + 1] === strong ||
              result[idx - 1] === strong || result[idx + 1] === strong ||
              result[idx + w - 1] === strong || result[idx + w] === strong || result[idx + w + 1] === strong;

            if (hasStrong) {
              result[idx] = strong;
              changed = true;
            }
          }
        }
      }
    }

    for (let i = 0; i < result.length; i++) {
      if (result[i] === weak) {
        result[i] = 0;
      }
    }

    return result;
  }

  private morphologicalClose(edges: Uint8Array, w: number, h: number): Uint8Array {
    const dilated = this.dilate(edges, w, h, 2);
    return this.erode(dilated, w, h, 2);
  }

  private dilate(data: Uint8Array, w: number, h: number, iterations: number): Uint8Array {
    let result = new Uint8Array(data);

    for (let iter = 0; iter < iterations; iter++) {
      const temp = new Uint8Array(result);

      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const idx = y * w + x;

          const maxVal = Math.max(
            temp[idx - w - 1], temp[idx - w], temp[idx - w + 1],
            temp[idx - 1], temp[idx], temp[idx + 1],
            temp[idx + w - 1], temp[idx + w], temp[idx + w + 1]
          );

          result[idx] = maxVal;
        }
      }
    }

    return result;
  }

  private erode(data: Uint8Array, w: number, h: number, iterations: number): Uint8Array {
    let result = new Uint8Array(data);

    for (let iter = 0; iter < iterations; iter++) {
      const temp = new Uint8Array(result);

      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const idx = y * w + x;

          const minVal = Math.min(
            temp[idx - w - 1], temp[idx - w], temp[idx - w + 1],
            temp[idx - 1], temp[idx], temp[idx + 1],
            temp[idx + w - 1], temp[idx + w], temp[idx + w + 1]
          );

          result[idx] = minVal;
        }
      }
    }

    return result;
  }

  private findContours(edges: Uint8Array, w: number, h: number): Point[][] {
    const visited = new Uint8Array(w * h);
    const contours: Point[][] = [];

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (edges[idx] > 0 && !visited[idx]) {
          const contour = this.traceContour(edges, visited, w, h, x, y);
          if (contour.length > 50) {
            contours.push(contour);
          }
        }
      }
    }

    return contours;
  }

  private traceContour(
    edges: Uint8Array,
    visited: Uint8Array,
    w: number,
    h: number,
    startX: number,
    startY: number
  ): Point[] {
    const contour: Point[] = [];
    const stack: Point[] = [{ x: startX, y: startY }];

    while (stack.length > 0) {
      const point = stack.pop()!;
      const idx = point.y * w + point.x;

      if (visited[idx]) continue;

      visited[idx] = 1;
      contour.push(point);

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;

          const nx = point.x + dx;
          const ny = point.y + dy;

          if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
            const nIdx = ny * w + nx;
            if (edges[nIdx] > 0 && !visited[nIdx]) {
              stack.push({ x: nx, y: ny });
            }
          }
        }
      }
    }

    return contour;
  }

  private approximateRectangle(contour: Point[], w: number, h: number): Point[] | null {
    if (contour.length < 4) return null;

    const epsilon = 0.02 * this.contourPerimeter(contour);
    const approx = this.douglasPeucker(contour, epsilon);

    if (approx.length !== 4) {
      return this.findBestQuadrilateral(contour);
    }

    return this.orderPoints(approx);
  }

  private contourPerimeter(contour: Point[]): number {
    let perimeter = 0;
    for (let i = 0; i < contour.length; i++) {
      const p1 = contour[i];
      const p2 = contour[(i + 1) % contour.length];
      perimeter += Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
    }
    return perimeter;
  }

  private douglasPeucker(points: Point[], epsilon: number): Point[] {
    if (points.length < 3) return points;

    let maxDist = 0;
    let maxIndex = 0;
    const first = points[0];
    const last = points[points.length - 1];

    for (let i = 1; i < points.length - 1; i++) {
      const dist = this.perpendicularDistance(points[i], first, last);
      if (dist > maxDist) {
        maxDist = dist;
        maxIndex = i;
      }
    }

    if (maxDist > epsilon) {
      const left = this.douglasPeucker(points.slice(0, maxIndex + 1), epsilon);
      const right = this.douglasPeucker(points.slice(maxIndex), epsilon);
      return left.slice(0, -1).concat(right);
    }

    return [first, last];
  }

  private perpendicularDistance(point: Point, lineStart: Point, lineEnd: Point): number {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;

    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) {
      return Math.sqrt((point.x - lineStart.x) ** 2 + (point.y - lineStart.y) ** 2);
    }

    const numerator = Math.abs(dy * point.x - dx * point.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x);
    return numerator / Math.sqrt(lenSq);
  }

  private findBestQuadrilateral(contour: Point[]): Point[] | null {
    if (contour.length < 4) return null;

    const minX = contour.reduce((min, p) => Math.min(min, p.x), Infinity);
    const maxX = contour.reduce((max, p) => Math.max(max, p.x), -Infinity);
    const minY = contour.reduce((min, p) => Math.min(min, p.y), Infinity);
    const maxY = contour.reduce((max, p) => Math.max(max, p.y), -Infinity);

    const topLeft = contour.reduce((closest, p) => {
      const dist = (p.x - minX) ** 2 + (p.y - minY) ** 2;
      const closestDist = (closest.x - minX) ** 2 + (closest.y - minY) ** 2;
      return dist < closestDist ? p : closest;
    });

    const topRight = contour.reduce((closest, p) => {
      const dist = (p.x - maxX) ** 2 + (p.y - minY) ** 2;
      const closestDist = (closest.x - maxX) ** 2 + (closest.y - minY) ** 2;
      return dist < closestDist ? p : closest;
    });

    const bottomRight = contour.reduce((closest, p) => {
      const dist = (p.x - maxX) ** 2 + (p.y - maxY) ** 2;
      const closestDist = (closest.x - maxX) ** 2 + (closest.y - maxY) ** 2;
      return dist < closestDist ? p : closest;
    });

    const bottomLeft = contour.reduce((closest, p) => {
      const dist = (p.x - minX) ** 2 + (p.y - maxY) ** 2;
      const closestDist = (closest.x - minX) ** 2 + (closest.y - maxY) ** 2;
      return dist < closestDist ? p : closest;
    });

    return [topLeft, topRight, bottomRight, bottomLeft];
  }

  private orderPoints(points: Point[]): Point[] {
    const sorted = [...points];

    sorted.sort((a, b) => (a.x + a.y) - (b.x + b.y));
    const topLeft = sorted[0];
    const bottomRight = sorted[3];

    const remaining = [sorted[1], sorted[2]];
    remaining.sort((a, b) => (a.y - a.x) - (b.y - b.x));

    return [topLeft, remaining[0], bottomRight, remaining[1]];
  }

  private tryHoughLineDetection(img: ImageData2D, w: number, h: number): DetectionResult {
    const edges = this.cannyEdgeDetection(img.data, w, h);
    const lines = this.houghLines(edges, w, h);

    if (lines.length < 4) {
      return this.getDefaultResult();
    }

    const rectangle = this.findRectangleFromLines(lines, w, h);

    if (!rectangle) {
      return this.getDefaultResult();
    }

    const confidence = Math.min(0.85, 0.5 + (lines.length / 20) * 0.35);

    return {
      points: this.normalizePoints(rectangle, w, h),
      confidence,
      method: 'Hough-Line'
    };
  }

  private houghLines(edges: Uint8Array, w: number, h: number): Array<{ rho: number; theta: number; votes: number }> {
    const maxDist = Math.sqrt(w * w + h * h);
    const rhoResolution = 2;
    const thetaResolution = Math.PI / 180;

    const rhoSteps = Math.ceil(maxDist * 2 / rhoResolution);
    const thetaSteps = Math.ceil(Math.PI / thetaResolution);

    const accumulator = new Array(rhoSteps).fill(0).map(() => new Array(thetaSteps).fill(0));

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (edges[y * w + x] > 0) {
          for (let thetaIdx = 0; thetaIdx < thetaSteps; thetaIdx++) {
            const theta = thetaIdx * thetaResolution;
            const rho = x * Math.cos(theta) + y * Math.sin(theta);
            const rhoIdx = Math.floor((rho + maxDist) / rhoResolution);

            if (rhoIdx >= 0 && rhoIdx < rhoSteps) {
              accumulator[rhoIdx][thetaIdx]++;
            }
          }
        }
      }
    }

    const threshold = Math.max(50, w * h * 0.001);
    const lines: Array<{ rho: number; theta: number; votes: number }> = [];

    for (let rhoIdx = 0; rhoIdx < rhoSteps; rhoIdx++) {
      for (let thetaIdx = 0; thetaIdx < thetaSteps; thetaIdx++) {
        if (accumulator[rhoIdx][thetaIdx] > threshold) {
          lines.push({
            rho: rhoIdx * rhoResolution - maxDist,
            theta: thetaIdx * thetaResolution,
            votes: accumulator[rhoIdx][thetaIdx]
          });
        }
      }
    }

    lines.sort((a, b) => b.votes - a.votes);
    return lines.slice(0, 20);
  }

  private findRectangleFromLines(
    lines: Array<{ rho: number; theta: number; votes: number }>,
    w: number,
    h: number
  ): Point[] | null {
    const horizontal = lines.filter(l => Math.abs(Math.sin(l.theta)) > 0.7);
    const vertical = lines.filter(l => Math.abs(Math.cos(l.theta)) > 0.7);

    if (horizontal.length < 2 || vertical.length < 2) {
      return null;
    }

    horizontal.sort((a, b) => a.rho - b.rho);
    vertical.sort((a, b) => a.rho - b.rho);

    const top = horizontal[0];
    const bottom = horizontal[horizontal.length - 1];
    const left = vertical[0];
    const right = vertical[vertical.length - 1];

    const topLeft = this.lineIntersection(top, left);
    const topRight = this.lineIntersection(top, right);
    const bottomRight = this.lineIntersection(bottom, right);
    const bottomLeft = this.lineIntersection(bottom, left);

    if (!topLeft || !topRight || !bottomRight || !bottomLeft) {
      return null;
    }

    return [
      { x: Math.max(0, Math.min(w, topLeft.x)), y: Math.max(0, Math.min(h, topLeft.y)) },
      { x: Math.max(0, Math.min(w, topRight.x)), y: Math.max(0, Math.min(h, topRight.y)) },
      { x: Math.max(0, Math.min(w, bottomRight.x)), y: Math.max(0, Math.min(h, bottomRight.y)) },
      { x: Math.max(0, Math.min(w, bottomLeft.x)), y: Math.max(0, Math.min(h, bottomLeft.y)) }
    ];
  }

  private lineIntersection(
    line1: { rho: number; theta: number },
    line2: { rho: number; theta: number }
  ): Point | null {
    const cos1 = Math.cos(line1.theta);
    const sin1 = Math.sin(line1.theta);
    const cos2 = Math.cos(line2.theta);
    const sin2 = Math.sin(line2.theta);

    const det = cos1 * sin2 - sin1 * cos2;

    if (Math.abs(det) < 0.001) {
      return null;
    }

    const x = (sin2 * line1.rho - sin1 * line2.rho) / det;
    const y = (cos1 * line2.rho - cos2 * line1.rho) / det;

    return { x, y };
  }

  private tryAdvancedContourAnalysis(img: ImageData2D, w: number, h: number): DetectionResult {
    const edges = this.cannyEdgeDetection(img.data, w, h);

    const margin = 10;
    let minX = margin;
    let maxX = w - margin;
    let minY = margin;
    let maxY = h - margin;

    const scanStep = 2;
    const minEdgeCount = Math.floor(Math.max(w, h) * 0.05);

    for (let x = margin; x < w / 2; x += scanStep) {
      let edgeCount = 0;
      for (let y = margin; y < h - margin; y++) {
        if (edges[y * w + x] > 0) edgeCount++;
      }
      if (edgeCount > minEdgeCount) {
        minX = x;
        break;
      }
    }

    for (let x = w - margin; x > w / 2; x -= scanStep) {
      let edgeCount = 0;
      for (let y = margin; y < h - margin; y++) {
        if (edges[y * w + x] > 0) edgeCount++;
      }
      if (edgeCount > minEdgeCount) {
        maxX = x;
        break;
      }
    }

    for (let y = margin; y < h / 2; y += scanStep) {
      let edgeCount = 0;
      for (let x = margin; x < w - margin; x++) {
        if (edges[y * w + x] > 0) edgeCount++;
      }
      if (edgeCount > minEdgeCount) {
        minY = y;
        break;
      }
    }

    for (let y = h - margin; y > h / 2; y -= scanStep) {
      let edgeCount = 0;
      for (let x = margin; x < w - margin; x++) {
        if (edges[y * w + x] > 0) edgeCount++;
      }
      if (edgeCount > minEdgeCount) {
        maxY = y;
        break;
      }
    }

    const rect = [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY }
    ];

    const confidence = this.scoreRectangle(rect, w, h, edges);

    return {
      points: this.normalizePoints(rect, w, h),
      confidence: Math.min(confidence, 0.75),
      method: 'Advanced-Scan'
    };
  }

  private scoreRectangle(rect: Point[], w: number, h: number, edges: Uint8Array): number {
    const area = this.rectangleArea(rect);
    const imageArea = w * h;
    const areaRatio = area / imageArea;

    let areaScore = 0;
    if (areaRatio > 0.2 && areaRatio < 0.9) {
      areaScore = 1 - Math.abs(areaRatio - 0.5) / 0.5;
    }

    const width = Math.abs(rect[1].x - rect[0].x);
    const height = Math.abs(rect[2].y - rect[1].y);
    const aspectRatio = Math.max(width, height) / Math.min(width, height);

    const targetAspectRatio = 1.5;
    const aspectScore = 1 - Math.min(1, Math.abs(aspectRatio - targetAspectRatio) / targetAspectRatio);

    let edgeStrength = 0;
    const samples = 100;

    for (let i = 0; i < 4; i++) {
      const p1 = rect[i];
      const p2 = rect[(i + 1) % 4];

      for (let j = 0; j < samples; j++) {
        const t = j / samples;
        const x = Math.round(p1.x + (p2.x - p1.x) * t);
        const y = Math.round(p1.y + (p2.y - p1.y) * t);

        if (x >= 0 && x < w && y >= 0 && y < h) {
          if (edges[y * w + x] > 0) {
            edgeStrength++;
          }
        }
      }
    }

    const edgeScore = edgeStrength / (samples * 4);

    const centerX = (rect[0].x + rect[1].x + rect[2].x + rect[3].x) / 4;
    const centerY = (rect[0].y + rect[1].y + rect[2].y + rect[3].y) / 4;
    const imageCenterX = w / 2;
    const imageCenterY = h / 2;

    const centerDist = Math.sqrt((centerX - imageCenterX) ** 2 + (centerY - imageCenterY) ** 2);
    const maxCenterDist = Math.sqrt(imageCenterX ** 2 + imageCenterY ** 2);
    const positionScore = 1 - (centerDist / maxCenterDist) * 0.5;

    return areaScore * 0.3 + aspectScore * 0.25 + edgeScore * 0.3 + positionScore * 0.15;
  }

  private rectangleArea(rect: Point[]): number {
    let area = 0;
    for (let i = 0; i < rect.length; i++) {
      const j = (i + 1) % rect.length;
      area += rect[i].x * rect[j].y;
      area -= rect[j].x * rect[i].y;
    }
    return Math.abs(area) / 2;
  }

  private normalizePoints(points: Point[], w: number, h: number): Point[] {
    return points.map(p => ({
      x: p.x / w,
      y: p.y / h
    }));
  }

  private getDefaultResult(): DetectionResult {
    return {
      points: [
        { x: 0.1, y: 0.1 },
        { x: 0.9, y: 0.1 },
        { x: 0.9, y: 0.9 },
        { x: 0.1, y: 0.9 }
      ],
      confidence: 0.3,
      method: 'Default'
    };
  }
}
