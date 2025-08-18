"use client";

// Dynamic import to prevent SSR issues
let faceapi: any = null;

const loadFaceAPI = async () => {
  if (typeof window === "undefined") return null;
  if (!faceapi) {
    faceapi = await import("@vladmandic/face-api");
  }
  return faceapi;
};

export class FaceDetectionService {
  private static instance: FaceDetectionService;
  private isInitialized = false;
  private modelsLoaded = false;
  private expressionModelLoaded = false;
  private landmarkModelLoaded = false;
  private initializationError: string | null = null;

  private constructor() {}

  static getInstance(): FaceDetectionService {
    if (!FaceDetectionService.instance) {
      FaceDetectionService.instance = new FaceDetectionService();
    }
    return FaceDetectionService.instance;
  }

  private async checkModelAvailability(): Promise<boolean> {
    try {
      const response = await fetch(
        "/models/tiny_face_detector_model-weights_manifest.json"
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  private async checkExpressionModelAvailability(): Promise<boolean> {
    try {
      const response = await fetch(
        "/models/face_expression_model-weights_manifest.json"
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  private async checkLandmarkModelAvailability(): Promise<boolean> {
    try {
      const response = await fetch(
        "/models/face_landmark_68_model-weights_manifest.json"
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Load face-api dynamically
      const api = await loadFaceAPI();
      if (!api) {
        this.initializationError = "Face API not available on server side";
        this.isInitialized = true;
        return;
      }

      const modelsAvailable = await this.checkModelAvailability();

      if (!modelsAvailable) {
        this.initializationError =
          "FaceAPI models not found. Please download the required model files.";

        this.isInitialized = true; // Mark as initialized but without models
        return;
      }

      // Load face detection model
      const MODEL_URL = "/models";

      await api.nets.tinyFaceDetector.loadFromUri(MODEL_URL);

      // Try to load expression model if available
      const expressionModelsAvailable =
        await this.checkExpressionModelAvailability();
      if (expressionModelsAvailable) {
        try {
          await api.nets.faceExpressionNet.loadFromUri(MODEL_URL);
          this.expressionModelLoaded = true;
        } catch (error) {
          this.expressionModelLoaded = false;
        }
      } else {
        this.expressionModelLoaded = false;
      }

      // Try to load landmark model if available
      const landmarkModelsAvailable =
        await this.checkLandmarkModelAvailability();
      if (landmarkModelsAvailable) {
        try {
          await api.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
          this.landmarkModelLoaded = true;
        } catch (error) {
          this.landmarkModelLoaded = false;
        }
      } else {
        this.landmarkModelLoaded = false;
      }

      this.modelsLoaded = true;
      this.isInitialized = true;
    } catch (error) {
      this.initializationError =
        "Failed to load FaceAPI models. Please check model files.";
      this.isInitialized = true; // Mark as initialized but with error
    }
  }

  async detectSingleFace(
    input: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement
  ): Promise<any | null> {
    if (!this.isInitialized || !this.modelsLoaded || !faceapi) {
      return null; // Return null instead of throwing error
    }

    try {
      const detection = await faceapi.detectSingleFace(
        input,
        new faceapi.TinyFaceDetectorOptions()
      );

      return detection || null;
    } catch (error) {
      return null;
    }
  }

  async detectSingleFaceWithExpressions(
    input: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement
  ): Promise<any> {
    if (!this.isInitialized || !this.modelsLoaded || !faceapi) {
      return null;
    }

    try {
      let detection;

      if (this.expressionModelLoaded && this.landmarkModelLoaded) {
        detection = await faceapi
          .detectSingleFace(input, new faceapi.TinyFaceDetectorOptions())
          .withFaceLandmarks()
          .withFaceExpressions();
      }

      //   if (detection) {
      //     // Log expressions if available
      //     if (detection.expressions) {
      //       const expressions = detection.expressions;
      //       const sortedExpressions = Object.entries(expressions)
      //         .sort(([, a], [, b]) => b - a)
      //         .slice(0, 3); // Top 3 expressions

      //       console.log("Face Expressions:", {
      //         dominant: sortedExpressions[0],
      //         all: expressions,
      //         timestamp: new Date().toISOString(),
      //       });
      //     }
      //   }

      return detection || null;
    } catch (error) {
      return null;
    }
  }

  isReady(): boolean {
    return this.isInitialized && this.modelsLoaded;
  }

  getInitializationError(): string | null {
    return this.initializationError;
  }

  hasModels(): boolean {
    return this.modelsLoaded;
  }

  hasExpressionModel(): boolean {
    return this.expressionModelLoaded;
  }

  hasLandmarkModel(): boolean {
    return this.landmarkModelLoaded;
  }
}

// Export singleton instance
export const faceDetectionService = FaceDetectionService.getInstance();
