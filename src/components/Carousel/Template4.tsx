import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Input,
  Switch,
  Upload,
  Form,
  message,
  Progress,
  Modal,
  Select,
  Tag,
} from "antd";
import { UploadOutlined, CloseCircleOutlined } from "@ant-design/icons";
import { storage, db } from "../../firebaseConfig";
import { ref as dbRef, push, set, get, query, orderByChild, equalTo } from "firebase/database";
import {
  ref as storageRef,
  getDownloadURL,
  uploadBytesResumable,
} from "firebase/storage";

const { Dragger } = Upload;

type Destination = "event" | "question" | "eventpage" | "questionpage";

/** How to validate the ID in DB */
type LookupConfig =
  | { basePath: string; strategy?: "byKey" } // expect node at basePath/<id>
  | { basePath: string; strategy: "byChild"; child: string }; // query basePath where child == id

type DestConfig = {
  label: string;
  path: string;
  needsIntent: boolean;       // controls if intent fields are shown/sent
  intentName?: string | null; // only relevant if needsIntent=true
  lookup?: LookupConfig;      // where/how to validate
};

const DEST_MAP: Record<Destination, DestConfig> = {
  event: {
    label: "Event Detail",
    path: "com.bestofluck.engineersataktu.Event.EventDetailActivity",
    needsIntent: true,
    intentName: "eventId",
    lookup: { basePath: "version12/Events", strategy: "byKey" },
  },
  question: {
    label: "Question Detail",
    path: "com.bestofluck.engineersataktu.QnA.QuestionDetailActivity",
    needsIntent: true,
    intentName: "questionId",
    lookup: { basePath: "version12/QnA", strategy: "byKey" }, 
  },
  eventpage: {
    label: "Event Page",
    path: "com.bestofluck.engineersataktu.Event.event_list",
    needsIntent: false,
  },
  questionpage: {
    label: "Question Page",
    path: "com.bestofluck.engineersataktu.QnA.QnA",
    needsIntent: false,
  },
};

const Template4: React.FC = () => {
  const [imageUrl, setImageUrl] = useState<string>("");
  const [rank, setRank] = useState<number>(1);
  const [isActive, setIsActive] = useState<1 | 0>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [formSubmitted, setFormSubmitted] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [, setUploadTask] = useState<any>(null);
  const [uploadDate, setUploadDate] = useState<string>("");
  const [uploadTime, setUploadTime] = useState<string>("");
  const [showSuccessModal, setShowSuccessModal] = useState<boolean>(false);

  // Destination
  const [dest, setDest] = useState<Destination>("question");
  const derived = useMemo(() => DEST_MAP[dest], [dest]);

  // Intent input (shown only when needed)
  const [intentValue, setIntentValue] = useState<string>("");

  // Validation states
  const [intentChecking, setIntentChecking] = useState(false);
  const [intentExists, setIntentExists] = useState<boolean | null>(null);
  const [intentErr, setIntentErr] = useState<string | null>(null);

  const debounceTimer = useRef<number | null>(null);
  const lastQueryRef = useRef<string>("");

  const [form] = Form.useForm();

  // --- normalize to exactly one leading '-' ---
  function normalizeIntent(raw: string): string {
    const s = (raw || "").trim();
    if (!s) return "";
    const stripped = s.replace(/^-+/, "");
    return stripped ? `-${stripped}` : "";
  }

  // Debounced validator for intentValue (normalized)
  useEffect(() => {
    // reset validation on dest/value change
    setIntentErr(null);
    setIntentExists(null);
    setIntentChecking(false);

    if (!derived.needsIntent) return; // no validation needed
    const v = normalizeIntent(intentValue);
    if (!v) return; // empty -> do nothing

    if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
    debounceTimer.current = window.setTimeout(async () => {
      setIntentChecking(true);
      setIntentErr(null);
      setIntentExists(null);
      lastQueryRef.current = v;

      try {
        const ok = await checkIdExists(derived.lookup!, v);
        if (lastQueryRef.current === v) {
          setIntentExists(ok);
          setIntentChecking(false);
        }
      } catch (e: any) {
        if (lastQueryRef.current === v) {
          setIntentErr(e?.message || "Validation failed");
          setIntentChecking(false);
          setIntentExists(null);
        }
      }
    }, 500);

    return () => {
      if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intentValue, derived.needsIntent, derived.lookup]);

  // Check existence by key or by child
  async function checkIdExists(lookup: LookupConfig, idWithDash: string): Promise<boolean> {
    if (!lookup) return false;

    // byKey (default)
    if (!("strategy" in lookup) || lookup.strategy === "byKey") {
      const snap = await get(dbRef(db, `${lookup.basePath}/${idWithDash}`));
      return snap.exists();
    }

    // byChild
    if (lookup.strategy === "byChild") {
      const q = query(dbRef(db, lookup.basePath), orderByChild(lookup.child), equalTo(idWithDash));
      const snap = await get(q);
      return snap.exists();
    }

    return false;
  }

  // Upload handler
  const handleImageUpload = async (file: any) => {
    const isValidImage = file.type === "image/jpeg" || file.type === "image/png";
    if (!isValidImage) {
      message.error("You can only upload JPEG or PNG images!");
      return false;
    }

    setLoading(true);

    const storagePath = storageRef(storage, `carousels/${file.name}`);
    const metadata = { contentType: file.type };
    const upload = uploadBytesResumable(storagePath, file, metadata);
    setUploadTask(upload);

    upload.on(
      "state_changed",
      (snapshot) => {
        const prog = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        setProgress(prog);
      },
      () => {
        message.error("Failed to upload image");
        setLoading(false);
      },
      async () => {
        const downloadURL = await getDownloadURL(upload.snapshot.ref);
        setImageUrl(downloadURL);
        message.success("Image uploaded successfully!");

        const current = new Date();
        setUploadDate(current.toLocaleDateString());
        setUploadTime(current.toLocaleTimeString());

        setLoading(false);
      }
    );

    return false;
  };

  const handleDeleteImage = () => {
    setImageUrl("");
    setProgress(0);
  };

  const handleDone = async () => {
    if (!imageUrl) {
      message.error("Upload an image first.");
      return;
    }
    if (!rank && rank !== 0) {
      message.error("Provide a valid rank.");
      return;
    }

    // For detail pages, enforce verified ID
    if (derived.needsIntent) {
      const v = normalizeIntent(intentValue);
      if (!v) {
        message.error("Provide intent value (ID).");
        return;
      }
      if (intentChecking) {
        message.warning("Still validating the ID. Please wait.");
        return;
      }
      if (intentExists !== true) {
        message.error("ID not verified. Fix the ID before submitting.");
        return;
      }
    }

    setFormSubmitted(true);

    // Base payload
    const itemData: Record<string, any> = {
      image: imageUrl,
      isActive,
      rank,
      type: "internal", // fixed/hidden
      path: derived.path,
      date: uploadDate,
      time: uploadTime,
    };

    // Add intent fields ONLY when required
    if (derived.needsIntent) {
      itemData.intentName = derived.intentName;
      itemData.intentValue = normalizeIntent(intentValue);
    }

    try {
      const carouselRef = dbRef(db, "version12/Carousel");
      const newItemRef = push(carouselRef);
      await set(newItemRef, itemData);
      setShowSuccessModal(true);

      setTimeout(() => {
        form.resetFields();
        setImageUrl("");
        setProgress(0);
        setFormSubmitted(false);
        setRank(1);
        setIsActive(1);
        setUploadDate("");
        setUploadTime("");
        setDest("question");
        setIntentValue("");
        setIntentExists(null);
        setIntentErr(null);
      }, 800);
    } catch (error) {
      console.error(error);
      message.error("Failed to save item");
      setFormSubmitted(false);
    }
  };

  const handleCancel = () => {
    form.resetFields();
    setImageUrl("");
    setProgress(0);
    setRank(1);
    setIsActive(1);
    setUploadDate("");
    setUploadTime("");
    setDest("question");
    setIntentValue("");
    setIntentExists(null);
    setIntentErr(null);
  };

  // Done button guard: require verified ID for detail pages
  const doneDisabled =
    !imageUrl ||
    !rank ||
    formSubmitted ||
    (derived.needsIntent
      ? (() => {
          const v = normalizeIntent(intentValue);
          return !v || intentChecking || intentExists !== true;
        })()
      : false);

  return (
    <div>
      <h2>Template 4: Create Internal Deep-Link Carousel Item</h2>

      <Form form={form} layout="vertical">
        {/* Image Upload */}
        <Form.Item label="Image Upload" required>
          <Dragger
            beforeUpload={(file) => {
              handleImageUpload(file);
              return false;
            }}
            showUploadList={false}
            disabled={formSubmitted}
          >
            <p className="ant-upload-drag-icon">
              <UploadOutlined />
            </p>
            <p className="ant-upload-text">Click or drag file to upload</p>
          </Dragger>
        </Form.Item>

        {loading && <Progress percent={progress} />}

        {/* Preview */}
        {imageUrl && (
          <div>
            <img
              src={imageUrl}
              alt="Uploaded"
              style={{ maxWidth: "50%", maxHeight: 600, marginBottom: 20 }}
            />
            <Button
              icon={<CloseCircleOutlined />}
              onClick={handleDeleteImage}
              type="link"
              danger
            >
              Delete Image
            </Button>
          </div>
        )}

        {imageUrl && (
          <Form.Item label="Image URL">
            <Input value={imageUrl} disabled />
          </Form.Item>
        )}

        {/* Rank */}
        <Form.Item
          label="Rank"
          name="rank"
          rules={[{ required: true, message: "Please enter rank" }]}
        >
          <Input
            type="number"
            value={rank}
            onChange={(e) => setRank(Number(e.target.value))}
            placeholder="Enter Rank"
          />
        </Form.Item>

        {/* Active */}
        <Form.Item label="Is Active">
          <Switch
            checked={isActive === 1}
            onChange={(checked) => setIsActive(checked ? 1 : 0)}
          />
        </Form.Item>

        {/* Destination */}
        <Form.Item
          label="Destination"
          name="destination"
          rules={[{ required: true, message: "Please select a destination" }]}
        >
          <Select<Destination>
            value={dest}
            onChange={(v) => setDest(v)}
            options={[
              { value: "event", label: DEST_MAP.event.label },
              { value: "question", label: DEST_MAP.question.label },
              { value: "eventpage", label: DEST_MAP.eventpage.label },
              { value: "questionpage", label: DEST_MAP.questionpage.label },
            ]}
          />
        </Form.Item>

        {/* Show derived path for transparency */}
        <Form.Item label="Android Activity Path">
          <Input value={derived.path} disabled />
        </Form.Item>

        {/* Intent fields ONLY when required */}
        {derived.needsIntent && (
          <>
            <Form.Item label="Intent Name (auto)">
              <Input value={derived.intentName || ""} disabled />
            </Form.Item>

            <Form.Item
              label={
                <>
                  Intent Value (we’ll prefix <code>-</code> automatically){" "}
                  {intentChecking && <Tag>validating…</Tag>}
                  {!intentChecking && intentExists === true && (
                    <Tag color="green">found</Tag>
                  )}
                  {!intentChecking && intentExists === false && (
                    <Tag color="red">not found</Tag>
                  )}
                </>
              }
              name="intentValue"
              validateStatus={
                intentChecking
                  ? "validating"
                  : intentExists === false
                  ? "error"
                  : intentExists === true
                  ? "success"
                  : undefined
              }
              help={
                intentErr
                  ? intentErr
                  : intentExists === false
                  ? "ID not found in database."
                  : intentExists === true
                  ? `Will use: ${normalizeIntent(intentValue)}`
                  : undefined
              }
              rules={[{ required: true, message: "Please enter intent value (ID)" }]}
            >
              <Input
                value={intentValue}
                onChange={(e) => setIntentValue(e.target.value)}
                placeholder="e.g., ORyn1Mu6gqa7siUEErO"
              />
            </Form.Item>
          </>
        )}

        {/* Actions */}
        <Form.Item>
          <Button type="primary" onClick={handleDone} disabled={doneDisabled}>
            Done
          </Button>
          <Button onClick={handleCancel} type="default" style={{ marginLeft: 10 }}>
            Cancel
          </Button>
        </Form.Item>
      </Form>

      <Modal
        open={showSuccessModal}
        title="Success"
        onOk={() => setShowSuccessModal(false)}
        onCancel={() => setShowSuccessModal(false)}
        footer={[
          <Button key="ok" type="primary" onClick={() => setShowSuccessModal(false)}>
            OK
          </Button>,
        ]}
      >
        <p>Your item has been saved successfully!</p>
      </Modal>
    </div>
  );
};

export default Template4;
