// ✅ NewOpportunities.tsx
// - Apply By Date uses DatePicker (DD-MM-YYYY, encrypted)
// - Stores logoUrl + logoPath (encrypted)
// - If no logo uploaded: auto-upload per-record dummy and then save
// - ❌ delete with retry (no DB drift), strict replace for re-upload
// - NEW: Submit loader (prevents double submit) + guards during save

import React, { useState } from 'react';
import {
  Layout, Form, Input, Button, message, Modal, Select, Switch, Upload, Image, DatePicker,
} from 'antd';
import { UploadOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { db, storage } from '../../firebaseConfig';
import { push, ref as dbRef, set } from 'firebase/database';
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import CryptoJS from 'crypto-js';
import dayjs from 'dayjs';

// 🔹 Ensure this asset exists
import defaultLogo from '../../assets/Default logo 1.png';

const { Content } = Layout;
const { Option } = Select;

const OPPORTUNITIES_AES_SECRET_KEY = import.meta.env.VITE_PLACEMENT_AES_SECRET_KEY;

const encryptAES = (plainText: string): string => {
  try {
    const key = CryptoJS.enc.Utf8.parse(OPPORTUNITIES_AES_SECRET_KEY);
    const encrypted = CryptoJS.AES.encrypt(plainText, key, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    });
    return encrypted.toString();
  } catch (error) {
    console.error('Encryption failed:', error);
    return plainText;
  }
};

const NewOpportunities: React.FC = () => {
  const [form] = Form.useForm();
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // Flags
  const [uploading, setUploading] = useState(false);
  const [deletingLogo, setDeletingLogo] = useState(false);
  const [saving, setSaving] = useState(false); // ← NEW: submit loader / guard

  // Single-logo state
  const [logoUrl, setLogoUrl] = useState<string>('');
  const [logoPath, setLogoPath] = useState<string>('');

  // Helpers
  const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

  async function deleteWithRetry(ref: any, maxTries = 3): Promise<
    { ok: true; alreadyMissing?: boolean } | { ok: false; code?: string; err?: unknown }
  > {
    const backoff = [250, 600, 1200];
    for (let attempt = 0; attempt < maxTries; attempt++) {
      try {
        await deleteObject(ref);
        return { ok: true };
      } catch (e: any) {
        if (e?.code === 'storage/object-not-found') return { ok: true, alreadyMissing: true };
        if (attempt === maxTries - 1) return { ok: false, code: e?.code, err: e };
        await sleep(backoff[Math.min(attempt, backoff.length - 1)]);
      }
    }
    return { ok: false, code: 'unknown' };
  }

  const ensureDummyLogo = async (opportunityId: string): Promise<{ url: string; path: string }> => {
    const resp = await fetch(defaultLogo);
    if (!resp.ok) throw new Error('Failed to load default logo asset');
    const blob = await resp.blob();

    const ext =
      blob.type === 'image/webp' ? 'webp' :
      blob.type === 'image/png'  ? 'png'  :
      blob.type === 'image/jpeg' ? 'jpg'  : 'png';

    const path = `opportunity_logos/dummy/${opportunityId}.${ext}`;
    const ref = storageRef(storage, path);

    await uploadBytes(ref, blob, { contentType: blob.type });
    const url = await getDownloadURL(ref);
    return { url, path: ref.fullPath };
  };

  // Strict replace upload
  const handleUpload = async (file: File) => {
    if (deletingLogo || uploading || saving) return false; // ← guard while saving too

    if (logoPath) {
      const res = await deleteWithRetry(storageRef(storage, logoPath));
      if (!res.ok) {
        message.error('Could not remove previous logo. Please try again.');
        return false;
      }
      setLogoUrl('');
      setLogoPath('');
      await sleep(60);
    }

    setUploading(true);
    const storagePath = `opportunity_logos/${Date.now()}_${file.name}`;
    const logoRef = storageRef(storage, storagePath);

    try {
      await uploadBytes(logoRef, file);
      const url = await getDownloadURL(logoRef);
      setLogoUrl(url);
      setLogoPath(logoRef.fullPath);
      message.success('Logo uploaded successfully');
    } catch (error) {
      console.error(error);
      message.error('Logo upload failed');
    } finally {
      setUploading(false);
    }

    return false;
  };

  // Pre-save delete
  const removeUploadedLogo = async () => {
    if (!logoPath) { setLogoUrl(''); setLogoPath(''); return; }
    if (uploading || deletingLogo || saving) return; // ← also guard during save

    setDeletingLogo(true);
    try {
      const res = await deleteWithRetry(storageRef(storage, logoPath));
      if (res.ok) {
        setLogoUrl('');
        setLogoPath('');
        res.alreadyMissing ? message.warning('Logo was already missing. Cleaned up.')
                           : message.success('Logo removed');
      } else {
        console.error('Logo delete failed', { path: logoPath, code: res.code, err: res.err });
        message.error('Failed to delete logo from storage. Try again.');
      }
    } finally {
      setDeletingLogo(false);
    }
  };

  const onFinish = async (values: any) => {
    const {
      title, companyName, jobProfile, salary, description, location,
      applyLink, applyByDate, type, isRemote, isVisible,
    } = values;

    if (saving || uploading || deletingLogo) {
      message.warning('Please wait for the current operation to finish.');
      return;
    }

    if (!title || !companyName || !jobProfile || !salary || !description || !location || !applyLink || !applyByDate || !type) {
      message.error('Please fill all required fields.');
      return;
    }

    setSaving(true); // ← start submit loader
    try {
      const applyByFormatted = applyByDate.format('DD-MM-YYYY');

      const opportunityRef = push(dbRef(db, 'version12/Placement/Opportunities'));
      const id = opportunityRef.key!;
      const createdDate = dayjs().format('DD/MM/YYYY');
      const createdTime = dayjs().format('HH:mm:ss');

      // Ensure a logo exists (uploaded or dummy)
      let finalLogoUrl = logoUrl;
      let finalLogoPath = logoPath;

      if (!finalLogoUrl || !finalLogoPath) {
        const dummy = await ensureDummyLogo(id);
        finalLogoUrl = dummy.url;
        finalLogoPath = dummy.path;
      }

      const encryptedData = {
        id,
        title: encryptAES(title),
        companyName: encryptAES(companyName),
        jobProfile: encryptAES(jobProfile),
        salary: encryptAES(salary),
        description: encryptAES(description),
        location: encryptAES(location),
        applyLink: encryptAES(applyLink),
        applyByDate: encryptAES(applyByFormatted),
        type: encryptAES(type),
        logoUrl: encryptAES(finalLogoUrl),
        logoPath: encryptAES(finalLogoPath),
        isRemote: encryptAES(String(isRemote ?? false)),
        // 👇 CHANGED: store 1/0 instead of "true"/"false"
        isVisible: encryptAES((isVisible ?? true) ? '1' : '0'),
        createdDate, // not encrypted
        createdTime, // not encrypted
      };

      await set(opportunityRef, encryptedData);
      message.success('Opportunity added successfully!');
      form.resetFields();
      setLogoUrl('');
      setLogoPath('');
      setShowSuccessModal(true);
    } catch (err) {
      console.error(err);
      message.error('Failed to add opportunity.');
    } finally {
      setSaving(false); // ← stop submit loader
    }
  };

  return (
    <Layout style={{ minHeight: '80vh' }}>
      <Content style={{ padding: 24, background: '#fff' }}>
        <h2 className="text-xl font-bold mb-4">Add New Opportunity</h2>

        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          initialValues={{ isRemote: true, isVisible: true }}
        >
          <Form.Item label="Title" name="title" rules={[{ required: true }]}>
            <Input placeholder="e.g. Android Developer Intern" disabled={saving} />
          </Form.Item>

          <Form.Item label="Company Name" name="companyName" rules={[{ required: true }]}>
            <Input placeholder="e.g. Techify Pvt Ltd" disabled={saving} />
          </Form.Item>

          <Form.Item label="Job Profile" name="jobProfile" rules={[{ required: true }]}>
            <Input placeholder="e.g. Android Developer" disabled={saving} />
          </Form.Item>

          <Form.Item label="Salary" name="salary" rules={[{ required: true }]}>
            <Input placeholder="e.g. ₹10,000/month" disabled={saving} />
          </Form.Item>

          <Form.Item label="Description" name="description" rules={[{ required: true }]}>
            <Input.TextArea rows={4} placeholder="Describe the job role..." disabled={saving} />
          </Form.Item>

          <Form.Item label="Location" name="location" rules={[{ required: true }]}>
            <Input placeholder="e.g. Remote / Bengaluru" disabled={saving} />
          </Form.Item>

          <Form.Item label="Apply Link" name="applyLink" rules={[{ required: true }]}>
            <Input placeholder="e.g. https://company.com/careers" disabled={saving} />
          </Form.Item>

          <Form.Item
            label="Apply By Date"
            name="applyByDate"
            rules={[{ required: true, message: 'Please pick a date' }]}
          >
            <DatePicker
              format="DD-MM-YYYY"
              style={{ width: '100%' }}
              inputReadOnly
              disabled={saving}
            />
          </Form.Item>

          <Form.Item label="Type" name="type" rules={[{ required: true }]}>
            <Select placeholder="Select type" disabled={saving}>
              <Option value="Internship">Internship</Option>
              <Option value="Job">Job</Option>
            </Select>
          </Form.Item>

          <Form.Item label="Logo Upload" required>
            {!logoUrl ? (
              <Upload
                beforeUpload={handleUpload}
                showUploadList={false}
                accept="image/*"
                disabled={saving} // ← block while saving
              >
                <Button icon={<UploadOutlined />} loading={uploading} disabled={saving}>
                  Upload Logo
                </Button>
              </Upload>
            ) : (
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <Image width={100} src={logoUrl} alt="Logo Preview" />
                <Button
                  icon={<CloseCircleOutlined />}
                  onClick={removeUploadedLogo}
                  type="text"
                  danger
                  loading={deletingLogo}
                  disabled={deletingLogo || saving} // ← block while saving
                  style={{ position: 'absolute', top: -8, right: -8 }}
                  aria-label="Remove uploaded logo"
                />
              </div>
            )}
          </Form.Item>

          <Form.Item label="Is Remote?" name="isRemote" valuePropName="checked">
            <Switch disabled={saving} />
          </Form.Item>

          <Form.Item label="Is Visible?" name="isVisible" valuePropName="checked">
            <Switch disabled={saving} />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={saving}                        // ← spinner on submit
              disabled={uploading || deletingLogo || saving} // ← no double submit
            >
              Add Opportunity
            </Button>
          </Form.Item>
        </Form>

        <Modal
          open={showSuccessModal}
          title="Success"
          onCancel={() => setShowSuccessModal(false)}
          footer={[
            <Button key="ok" type="primary" onClick={() => setShowSuccessModal(false)}>OK</Button>,
          ]}
        >
          <p>New opportunity has been added successfully!</p>
        </Modal>
      </Content>
    </Layout>
  );
};

export default NewOpportunities;


// // ✅ Updated NewOpportunities.tsx
// // Includes: createdDate + createdTime fields in dd/mm/yyyy format, stored unencrypted

// import React, { useState } from 'react';
// import {
//   Layout, Form, Input, Button, message, Modal, Select, Switch, Upload, Image,
// } from 'antd';
// import { UploadOutlined } from '@ant-design/icons';
// import { db, storage } from '../../firebaseConfig';
// import { push, ref as dbRef, set } from 'firebase/database';
// import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
// import CryptoJS from 'crypto-js';
// import dayjs from 'dayjs';

// const { Content } = Layout;
// const { Option } = Select;

// const OPPORTUNITIES_AES_SECRET_KEY = import.meta.env.VITE_PLACEMENT_AES_SECRET_KEY;

// const encryptAES = (plainText: string): string => {
//   try {
//     const key = CryptoJS.enc.Utf8.parse(OPPORTUNITIES_AES_SECRET_KEY);
//     const encrypted = CryptoJS.AES.encrypt(plainText, key, {
//       mode: CryptoJS.mode.ECB,
//       padding: CryptoJS.pad.Pkcs7,
//     });
//     return encrypted.toString();
//   } catch (error) {
//     console.error('Encryption failed:', error);
//     return plainText;
//   }
// };

// const NewOpportunities: React.FC = () => {
//   const [form] = Form.useForm();
//   const [showSuccessModal, setShowSuccessModal] = useState(false);
//   const [uploading, setUploading] = useState(false);
//   const [logoUrl, setLogoUrl] = useState<string>('');

//   const onFinish = async (values: any) => {
//     const {
//       title, companyName, jobProfile, salary, description, location,
//       applyLink, applyByDate, type, isRemote, isVisible,
//     } = values;

//     if (!title || !companyName || !jobProfile || !salary || !description || !location || !applyLink || !applyByDate || !type || !logoUrl) {
//       message.error('Please fill all required fields.');
//       return;
//     }

//     const opportunityRef = push(dbRef(db, 'version12/Placement/Opportunities'));
//     const id = opportunityRef.key;

//     const createdDate = dayjs().format("DD/MM/YYYY");
//     const createdTime = dayjs().format("HH:mm:ss");

//     const encryptedData = {
//       id,
//       title: encryptAES(title),
//       companyName: encryptAES(companyName),
//       jobProfile: encryptAES(jobProfile),
//       salary: encryptAES(salary),
//       description: encryptAES(description),
//       location: encryptAES(location),
//       applyLink: encryptAES(applyLink),
//       applyByDate: encryptAES(applyByDate),
//       type: encryptAES(type),
//       logoUrl: encryptAES(logoUrl),
//       isRemote: encryptAES(String(isRemote ?? false)),
//       isVisible: encryptAES(String(isVisible ?? true)),
//       createdDate,     // Not encrypted
//       createdTime,     // Not encrypted
//     };

//     try {
//       await set(opportunityRef, encryptedData);
//       message.success('Opportunity added successfully!');
//       form.resetFields();
//       setLogoUrl('');
//       setShowSuccessModal(true);
//     } catch (err) {
//       console.error(err);
//       message.error('Failed to add opportunity.');
//     }
//   };

//   const handleUpload = async (file: File) => {
//     setUploading(true);
//     const storagePath = `opportunity_logos/${Date.now()}_${file.name}`;
//     const logoRef = storageRef(storage, storagePath);

//     try {
//       await uploadBytes(logoRef, file);
//       const url = await getDownloadURL(logoRef);
//       setLogoUrl(url);
//       message.success('Logo uploaded successfully');
//     } catch (error) {
//       console.error(error);
//       message.error('Logo upload failed');
//     } finally {
//       setUploading(false);
//     }

//     return false;
//   };

//   return (
//     <Layout style={{ minHeight: '80vh' }}>
//       <Content style={{ padding: 24, background: '#fff' }}>
//         <h2 className="text-xl font-bold mb-4">Add New Opportunity</h2>

//         <Form
//           form={form}
//           layout="vertical"
//           onFinish={onFinish}
//           initialValues={{ isRemote: true, isVisible: true }}
//         >
//           <Form.Item label="Title" name="title" rules={[{ required: true }]}>
//             <Input placeholder="e.g. Android Developer Intern" />
//           </Form.Item>

//           <Form.Item label="Company Name" name="companyName" rules={[{ required: true }]}>
//             <Input placeholder="e.g. Techify Pvt Ltd" />
//           </Form.Item>

//           <Form.Item label="Job Profile" name="jobProfile" rules={[{ required: true }]}>
//             <Input placeholder="e.g. Android Developer" />
//           </Form.Item>

//           <Form.Item label="Salary" name="salary" rules={[{ required: true }]}>
//             <Input placeholder="e.g. ₹10,000/month" />
//           </Form.Item>

//           <Form.Item label="Description" name="description" rules={[{ required: true }]}>
//             <Input.TextArea rows={4} placeholder="Describe the job role..." />
//           </Form.Item>

//           <Form.Item label="Location" name="location" rules={[{ required: true }]}>
//             <Input placeholder="e.g. Remote / Bengaluru" />
//           </Form.Item>

//           <Form.Item label="Apply Link" name="applyLink" rules={[{ required: true }]}>
//             <Input placeholder="e.g. https://company.com/careers" />
//           </Form.Item>

//           <Form.Item label="Apply By Date" name="applyByDate" rules={[{ required: true }]}>
//             <Input placeholder="e.g. 01-12-2025" />
//           </Form.Item>

//           <Form.Item label="Type" name="type" rules={[{ required: true }]}>
//             <Select placeholder="Select type">
//               <Option value="Internship">Internship</Option>
//               <Option value="Job">Job</Option>
//             </Select>
//           </Form.Item>

//           <Form.Item label="Logo Upload" required>
//             <Upload
//               beforeUpload={handleUpload}
//               showUploadList={false}
//               accept="image/*"
//             >
//               <Button icon={<UploadOutlined />} loading={uploading}>Upload Logo</Button>
//             </Upload>
//             {logoUrl && (
//               <div className="mt-2">
//                 <span className="text-xs text-gray-500">Preview:</span><br />
//                 <Image width={100} src={logoUrl} alt="Logo Preview" />
//               </div>
//             )}
//           </Form.Item>

//           <Form.Item label="Is Remote?" name="isRemote" valuePropName="checked">
//             <Switch />
//           </Form.Item>

//           <Form.Item label="Is Visible?" name="isVisible" valuePropName="checked">
//             <Switch />
//           </Form.Item>

//           <Form.Item>
//             <Button type="primary" htmlType="submit">Add Opportunity</Button>
//           </Form.Item>
//         </Form>

//         <Modal
//           open={showSuccessModal}
//           title="Success"
//           onCancel={() => setShowSuccessModal(false)}
//           footer={[
//             <Button key="ok" type="primary" onClick={() => setShowSuccessModal(false)}>OK</Button>,
//           ]}
//         >
//           <p>New opportunity has been added successfully!</p>
//         </Modal>
//       </Content>
//     </Layout>
//   );
// };

// export default NewOpportunities;
