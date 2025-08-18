"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CheckCircle,
  Loader2,
  Upload,
  XCircle,
  RotateCcw,
  Save,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useRef } from "react";
import SignatureCanvas from "react-signature-canvas";

interface ApiResponse {
  [key: string]: any;
}

export default function FileUploadTest() {
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [apiBaseUrl, setApiBaseUrl] = useState(
    process.env.NEXT_PUBLIC_API_BASE_URL ||
      "https://02c6589b1c28.ngrok-free.app"
  );
  const [activeTab, setActiveTab] = useState("quality");
  const [savedSignature, setSavedSignature] = useState<string | null>(null);
  const router = useRouter();
  const signatureRef = useRef<SignatureCanvas>(null);

  const handleFileUpload = async (
    endpoint: string,
    files: { [key: string]: File },
    params: { [key: string]: string | number | boolean } = {}
  ) => {
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const formData = new FormData();

      // Add files to form data
      Object.entries(files).forEach(([key, file]) => {
        formData.append(key, file);
      });

      // Build query parameters
      const queryParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        queryParams.append(key, value.toString());
      });

      const url = `${apiBaseUrl}${endpoint}${
        queryParams.toString() ? `?${queryParams.toString()}` : ""
      }`;

      const res = await fetch(url, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const data = await res.json();
      setResponse(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const QualityCheckTab = () => {
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [blurThr, setBlurThr] = useState(120);
    const [darkThr, setDarkThr] = useState(70);
    const [contrastThr, setContrastThr] = useState(35);
    const [returnOverlay, setReturnOverlay] = useState(false);

    const handleSubmit = () => {
      if (!imageFile) {
        setError("Please select an image file");
        return;
      }
      handleFileUpload(
        "/quality",
        { image: imageFile },
        {
          blur_thr: blurThr,
          dark_thr: darkThr,
          contrast_thr: contrastThr,
          return_overlay: returnOverlay,
        }
      );
    };

    return (
      <div className="space-y-4">
        <div>
          <Label htmlFor="image">Image File</Label>
          <Input
            id="image"
            type="file"
            accept="image/*"
            onChange={(e) => setImageFile(e.target.files?.[0] || null)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="blur-thr">Blur Threshold</Label>
            <Input
              id="blur-thr"
              type="number"
              value={blurThr}
              onChange={(e) => setBlurThr(Number(e.target.value))}
            />
          </div>
          <div>
            <Label htmlFor="dark-thr">Dark Threshold</Label>
            <Input
              id="dark-thr"
              type="number"
              value={darkThr}
              onChange={(e) => setDarkThr(Number(e.target.value))}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="contrast-thr">Contrast Threshold</Label>
            <Input
              id="contrast-thr"
              type="number"
              value={contrastThr}
              onChange={(e) => setContrastThr(Number(e.target.value))}
            />
          </div>
          <div className="flex items-center space-x-2">
            <input
              id="return-overlay"
              type="checkbox"
              checked={returnOverlay}
              onChange={(e) => setReturnOverlay(e.target.checked)}
            />
            <Label htmlFor="return-overlay">Return Overlay</Label>
          </div>
        </div>

        <Button
          onClick={handleSubmit}
          disabled={loading || !imageFile}
          className="w-full"
        >
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Upload className="mr-2 h-4 w-4" />
          )}
          Check Quality
        </Button>
      </div>
    );
  };

  const SignatureExtractTab = () => {
    const [ktpFile, setKtpFile] = useState<File | null>(null);
    const [cropBottom, setCropBottom] = useState(0.45);
    const [minAreaRatio, setMinAreaRatio] = useState(0.01);

    const handleSubmit = () => {
      if (!ktpFile) {
        setError("Please select a KTP file");
        return;
      }
      handleFileUpload(
        "/signature",
        { ktp: ktpFile },
        {
          crop_bottom: cropBottom,
          min_area_ratio: minAreaRatio,
        }
      );
    };

    return (
      <div className="space-y-4">
        <div>
          <Label htmlFor="ktp">KTP File</Label>
          <Input
            id="ktp"
            type="file"
            accept="image/*"
            onChange={(e) => setKtpFile(e.target.files?.[0] || null)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="crop-bottom">Crop Bottom</Label>
            <Input
              id="crop-bottom"
              type="number"
              step="0.01"
              value={cropBottom}
              onChange={(e) => setCropBottom(Number(e.target.value))}
            />
          </div>
          <div>
            <Label htmlFor="min-area-ratio">Min Area Ratio</Label>
            <Input
              id="min-area-ratio"
              type="number"
              step="0.001"
              value={minAreaRatio}
              onChange={(e) => setMinAreaRatio(Number(e.target.value))}
            />
          </div>
        </div>

        <Button
          onClick={handleSubmit}
          disabled={loading || !ktpFile}
          className="w-full"
        >
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Upload className="mr-2 h-4 w-4" />
          )}
          Extract Signature
        </Button>
      </div>
    );
  };

  const FaceCompareTab = () => {
    const [selfieFile, setSelfieFile] = useState<File | null>(null);
    const [idImageFile, setIdImageFile] = useState<File | null>(null);
    const [threshold, setThreshold] = useState(0.42);

    const handleSubmit = () => {
      if (!selfieFile || !idImageFile) {
        setError("Please select both selfie and ID image files");
        return;
      }
      handleFileUpload(
        "/face-compare",
        { selfie: selfieFile, idimage: idImageFile },
        {
          threshold: threshold,
        }
      );
    };

    return (
      <div className="space-y-4">
        <div>
          <Label htmlFor="selfie">Selfie File</Label>
          <Input
            id="selfie"
            type="file"
            accept="image/*"
            onChange={(e) => setSelfieFile(e.target.files?.[0] || null)}
          />
        </div>

        <div>
          <Label htmlFor="idimage">ID Image File</Label>
          <Input
            id="idimage"
            type="file"
            accept="image/*"
            onChange={(e) => setIdImageFile(e.target.files?.[0] || null)}
          />
        </div>

        <div>
          <Label htmlFor="threshold">Threshold</Label>
          <Input
            id="threshold"
            type="number"
            step="0.01"
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
          />
        </div>

        <Button
          onClick={handleSubmit}
          disabled={loading || !selfieFile || !idImageFile}
          className="w-full"
        >
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Upload className="mr-2 h-4 w-4" />
          )}
          Compare Faces
        </Button>
      </div>
    );
  };

  const SignatureDrawTab = () => {
    const handleReset = () => {
      if (signatureRef.current) {
        signatureRef.current.clear();
      }
    };

    const handleSave = () => {
      if (signatureRef.current) {
        const signatureData = signatureRef.current.toDataURL();
        setSavedSignature(signatureData);
      }
    };

    return (
      <div className="space-y-4">
        <div>
          <Label>Draw Your Signature</Label>
          <div className="border border-gray-300 rounded-lg p-2 bg-white relative w-full h-[200px]">
            <SignatureCanvas
              ref={signatureRef}
              backgroundColor="rgb(255, 255, 255)"
              penColor="black"
              minWidth={1}
              maxWidth={3}
              canvasProps={{
                style: {
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                },
              }}
            />
          </div>
        </div>

        <div className="flex gap-4">
          <Button onClick={handleReset} variant="outline" className="flex-1">
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset
          </Button>
          <Button onClick={handleSave} className="flex-1">
            <Save className="mr-2 h-4 w-4" />
            Save Signature
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">E-Contract Vision API Test</h1>
        <p className="text-muted-foreground">
          Test file upload endpoints for quality check, signature extraction,
          and face comparison
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>API Configuration</CardTitle>
          <CardDescription>Set the base URL for the API</CardDescription>
          <Button
            className="text-white"
            onClick={() => {
              router.push("/face-detection");
            }}
          >
            Go to Face Detection
          </Button>
          <Button
            className="text-white"
            onClick={() => {
              router.push("/liveness");
            }}
          >
            Go to Liveness Check
          </Button>
        </CardHeader>
        <CardContent>
          <div>
            <Label className="mb-2" htmlFor="api-url">
              API Base URL
            </Label>
            <Input
              id="api-url"
              value={apiBaseUrl}
              onChange={(e) => setApiBaseUrl(e.target.value)}
              placeholder="http://localhost:8000"
            />
          </div>
        </CardContent>
      </Card>

      <Tabs
        defaultValue="quality"
        className="mb-6"
        value={activeTab}
        onValueChange={setActiveTab}
      >
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="quality">Quality Check</TabsTrigger>
          <TabsTrigger value="signature">Signature Extract</TabsTrigger>
          <TabsTrigger value="face-compare">Face Compare</TabsTrigger>
          <TabsTrigger value="signature-draw">Draw Signature</TabsTrigger>
        </TabsList>

        <TabsContent value="quality" key="quality">
          <Card>
            <CardHeader>
              <CardTitle>Quality Check</CardTitle>
              <CardDescription>
                Upload an image to check its quality (blur, darkness, contrast)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <QualityCheckTab />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="signature" key="signature">
          <Card>
            <CardHeader>
              <CardTitle>Signature Extract</CardTitle>
              <CardDescription>
                Upload a KTP document to extract signature
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SignatureExtractTab />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="face-compare" key="face-compare">
          <Card>
            <CardHeader>
              <CardTitle>Face Compare</CardTitle>
              <CardDescription>
                Upload selfie and ID image to compare faces
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FaceCompareTab />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="signature-draw" key="signature-draw">
          <Card>
            <CardHeader>
              <CardTitle>Draw Signature</CardTitle>
              <CardDescription>
                Draw your signature using the canvas below
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SignatureDrawTab />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {error && (
        <Alert className="mb-6 border-red-200 bg-red-50">
          <XCircle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">{error}</AlertDescription>
        </Alert>
      )}

      {response && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              API Response
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-gray-50 p-4 rounded-lg overflow-auto text-sm">
              {JSON.stringify(response, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
      {activeTab === "signature" && response?.signature_png_b64 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Signature
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Image
              src={`data:image/png;base64,${response.signature_png_b64}`}
              alt="Signature"
              className="w-full max-w-xs"
              width={500}
              height={500}
            />
          </CardContent>
        </Card>
      )}
      {activeTab === "quality" && response?.overlay_png_b64 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Overlay
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Image
              src={`data:image/png;base64,${response.overlay_png_b64}`}
              alt="Overlay"
              className="w-full max-w-xs"
              width={500}
              height={500}
            />
          </CardContent>
        </Card>
      )}
      {activeTab === "signature-draw" && savedSignature && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Saved Signature
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Image
              src={savedSignature}
              alt="Saved Signature"
              className="w-full max-w-xs border border-gray-300 rounded-lg"
              width={500}
              height={200}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}