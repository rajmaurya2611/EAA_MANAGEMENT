import React, { useState } from 'react';
import {
  Form,
  Input,
  Button,
  DatePicker,
  Modal,
  Upload,
  Progress,
  message,
} from 'antd';
import { UploadOutlined, CloseCircleOutlined } from '@ant-design/icons';
import moment from 'moment';
import CryptoJS from 'crypto-js';
import { storage, db } from '../../firebaseConfig';
import {
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { ref as dbRef, push, set } from 'firebase/database';

const { TextArea } = Input;
const AES_KEY = import.meta.env.VITE_PLACEMENT_AES_SECRET_KEY;

// AES helper
const encryptAES = (plain: string): string => {
  try {
    const key = CryptoJS.enc.Utf8.parse(AES_KEY);
    return CryptoJS.AES.encrypt(plain, key, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    }).toString();
  } catch (e) {
    console.error('AES encrypt error', e);
    return plain;
  }
};

const NewEvent: React.FC = () => {
  const [form] = Form.useForm();

  // now an array of { url, ref, path } so we can also persist fullPath
  const [banners, setBanners] = useState<{ url: string; ref: any; path: string }[]>([]);
  const [showImageModal, setShowImageModal] = useState(false);
  const [uploadingIndex, setUploadingIndex] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);

  // start image upload for a new index
  const startImageUpload = (index: number, file: File) => {
    setUploading(true);
    const path = `events/${file.name}_${Date.now()}`;
    const ref = storageRef(storage, path);
    const task = uploadBytesResumable(ref, file);

    task.on(
      'state_changed',
      snap => {
        const pct = (snap.bytesTransferred / snap.totalBytes) * 100;
        setUploadProgress(pct);
      },
      () => {
        message.error('Upload failed');
        setUploading(false);
      },
      async () => {
        const url = await getDownloadURL(ref);
        // IMPORTANT: capture fullPath for deletion later from Manage UI
        setBanners(prev => [...prev, { url, ref, path: ref.fullPath }]);
        message.success(`Image #${index + 1} uploaded`);
        setUploading(false);
        setShowImageModal(false);
      }
    );

    return false; // prevent auto-upload by AntD
  };

  // remove an uploaded image (from UI state + Storage)
  const handleRemoveImage = async (idx: number) => {
    const banner = banners[idx];
    try {
      await deleteObject(banner.ref);
      message.success(`Removed image #${idx + 1}`);
    } catch {
      message.error('Failed to remove from storage');
    }
    setBanners(prev => prev.filter((_, i) => i !== idx));
  };

  // form submit
  const onFinish = async (vals: any) => {
    if (!banners.length) {
      message.error('Please upload at least one banner image');
      return;
    }

    // generate IST timestamp in same format as ManageEvents expects
    const nowIst = moment()
      .utcOffset('+05:30')
      .format('YYYY-MM-DD HH:mm:ss');
    const createdAt = encryptAES(nowIst);

    const eventRef = push(dbRef(db, 'version12/Events'));
    const eventDate = vals.date.format('DD-MM-YYYY');

    const data = {
      id: eventRef.key,
      title: encryptAES(vals.title),
      description: encryptAES(vals.description),
      organizer: encryptAES(vals.organizer),
      location: encryptAES(vals.location),
      date: encryptAES(eventDate),
      type: encryptAES(vals.type),
      applyLink: encryptAES(vals.applyLink),
      // encrypt each download URL
      bannerUrls: banners.map(b => encryptAES(b.url)),
      // NEW: persist encrypted storage paths (ref.fullPath)
      bannerPaths: banners.map(b => encryptAES(b.path)),
      // record creation timestamp in IST
      createdAt,
    };

    try {
      await set(eventRef, data);
      message.success('Event created');
      form.resetFields();
      setBanners([]);
    } catch {
      message.error('Failed to save event');
    }
  };

  return (
    <div
      style={{
        maxWidth: 600,
        margin: '0 auto',
        padding: 24,
        background: '#fff',
      }}
    >
      <h2>Create New Event</h2>
      <Form form={form} layout="vertical" onFinish={onFinish}>
        <Form.Item
          label="Title"
          name="title"
          rules={[{ required: true, message: 'Please enter title' }]}
        >
          <Input />
        </Form.Item>

        <Form.Item
          label="Description"
          name="description"
          rules={[{ required: true, message: 'Please enter description' }]}
        >
          <TextArea rows={4} />
        </Form.Item>

        <Form.Item
          label="Organizer"
          name="organizer"
          rules={[{ required: true, message: 'Please enter organizer name' }]}
        >
          <Input />
        </Form.Item>

        <Form.Item
          label="Location"
          name="location"
          rules={[{ required: true, message: 'Please enter location' }]}
        >
          <Input />
        </Form.Item>

        <Form.Item
          label="Date"
          name="date"
          rules={[{ required: true, message: 'Please pick a date' }]}
        >
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>

        <Form.Item
          label="Type"
          name="type"
          rules={[{ required: true, message: 'Please enter event type' }]}
        >
          <Input placeholder="e.g. Cultural Fest, Tech Talk…" />
        </Form.Item>

        <Form.Item
          label="Apply Link"
          name="applyLink"
          rules={[{ required: true, message: 'Please enter application URL' }]}
        >
          <Input />
        </Form.Item>

        {/* Banner Images section */}
        <Form.Item label="Banner Images">
          {banners.map((b, i) => (
            <div key={i} style={{ marginBottom: 8, position: 'relative' }}>
              <img
                src={b.url}
                alt={`banner-${i}`}
                style={{ maxWidth: '100%', borderRadius: 4 }}
              />
              <Button
                icon={<CloseCircleOutlined />}
                onClick={() => handleRemoveImage(i)}
                type="text"
                danger
                style={{ position: 'absolute', top: 8, right: 8 }}
              />
            </div>
          ))}

          <Button
            icon={<UploadOutlined />}
            onClick={() => {
              setUploadingIndex(banners.length);
              setShowImageModal(true);
            }}
          >
            {banners.length === 0
              ? 'Upload Banner Image'
              : `Add Banner Image #${banners.length + 1}`}
          </Button>
        </Form.Item>

        <Form.Item>
          <Button type="primary" htmlType="submit">
            Save Event
          </Button>
        </Form.Item>
      </Form>

      {/* Image Upload Modal */}
      <Modal
        title={`Upload Image #${uploadingIndex + 1}`}
        open={showImageModal}
        onCancel={() => setShowImageModal(false)}
        footer={null}
        destroyOnClose
      >
        <Upload.Dragger
          beforeUpload={file => startImageUpload(uploadingIndex, file as File)}
          showUploadList={false}
          disabled={uploading}
        >
          <p className="ant-upload-drag-icon">
            <UploadOutlined />
          </p>
          <p>Click or drag to upload</p>
        </Upload.Dragger>

        {uploading && <Progress percent={uploadProgress} />}
      </Modal>
    </div>
  );
};

export default NewEvent;


// import React, { useState } from 'react';
// import {
//   Form,
//   Input,
//   Button,
//   DatePicker,
//   Modal,
//   Upload,
//   Progress,
//   message,
// } from 'antd';
// import { UploadOutlined, CloseCircleOutlined } from '@ant-design/icons';
// import moment from 'moment';
// import CryptoJS from 'crypto-js';
// import { storage, db } from '../../firebaseConfig';
// import {
//   ref as storageRef,
//   uploadBytesResumable,
//   getDownloadURL,
//   deleteObject,
// } from 'firebase/storage';
// import { ref as dbRef, push, set } from 'firebase/database';

// const { TextArea } = Input;
// const AES_KEY = import.meta.env.VITE_PLACEMENT_AES_SECRET_KEY;

// // AES helper
// const encryptAES = (plain: string): string => {
//   try {
//     const key = CryptoJS.enc.Utf8.parse(AES_KEY);
//     return CryptoJS.AES.encrypt(plain, key, {
//       mode: CryptoJS.mode.ECB,
//       padding: CryptoJS.pad.Pkcs7,
//     }).toString();
//   } catch (e) {
//     console.error('AES encrypt error', e);
//     return plain;
//   }
// };

// const NewEvent: React.FC = () => {
//   const [form] = Form.useForm();

//   // now an array of { url, ref } so we can delete from storage
//   const [banners, setBanners] = useState<{ url: string; ref: any }[]>([]);
//   const [showImageModal, setShowImageModal] = useState(false);
//   const [uploadingIndex, setUploadingIndex] = useState(0);
//   const [uploadProgress, setUploadProgress] = useState(0);
//   const [uploading, setUploading] = useState(false);

//   // start image upload for a new index
//   const startImageUpload = (index: number, file: File) => {
//     setUploading(true);
//     const path = `events/${file.name}_${Date.now()}`;
//     const ref = storageRef(storage, path);
//     const task = uploadBytesResumable(ref, file);

//     task.on(
//       'state_changed',
//       snap => {
//         const pct = (snap.bytesTransferred / snap.totalBytes) * 100;
//         setUploadProgress(pct);
//       },
//       () => {
//         message.error('Upload failed');
//         setUploading(false);
//       },
//       async () => {
//         const url = await getDownloadURL(ref);
//         setBanners(prev => [...prev, { url, ref }]);
//         message.success(`Image #${index + 1} uploaded`);
//         setUploading(false);
//         setShowImageModal(false);
//       }
//     );

//     return false; // prevent auto-upload by AntD
//   };

//   // remove an uploaded image (from UI state + Storage)
//   const handleRemoveImage = async (idx: number) => {
//     const banner = banners[idx];
//     try {
//       await deleteObject(banner.ref);
//       message.success(`Removed image #${idx + 1}`);
//     } catch {
//       message.error('Failed to remove from storage');
//     }
//     setBanners(prev => prev.filter((_, i) => i !== idx));
//   };

//   // form submit
//   const onFinish = async (vals: any) => {
//     if (!banners.length) {
//       message.error('Please upload at least one banner image');
//       return;
//     }

//     // generate IST timestamp in same format as ManageEvents expects
//     const nowIst = moment()
//       .utcOffset('+05:30')
//       .format('YYYY-MM-DD HH:mm:ss');
//     const createdAt = encryptAES(nowIst);

//     const eventRef = push(dbRef(db, 'version12/Events'));
//     const eventDate = vals.date.format('DD-MM-YYYY');

//     const data = {
//       id: eventRef.key,
//       title: encryptAES(vals.title),
//       description: encryptAES(vals.description),
//       organizer: encryptAES(vals.organizer),
//       location: encryptAES(vals.location),
//       date: encryptAES(eventDate),
//       type: encryptAES(vals.type),
//       applyLink: encryptAES(vals.applyLink),
//       // encrypt each download URL
//       bannerUrls: banners.map(b => encryptAES(b.url)),
//       // record creation timestamp in IST
//       createdAt,
//     };

//     try {
//       await set(eventRef, data);
//       message.success('Event created');
//       form.resetFields();
//       setBanners([]);
//     } catch {
//       message.error('Failed to save event');
//     }
//   };

//   return (
//     <div
//       style={{
//         maxWidth: 600,
//         margin: '0 auto',
//         padding: 24,
//         background: '#fff',
//       }}
//     >
//       <h2>Create New Event</h2>
//       <Form form={form} layout="vertical" onFinish={onFinish}>
//         <Form.Item
//           label="Title"
//           name="title"
//           rules={[{ required: true, message: 'Please enter title' }]}
//         >
//           <Input />
//         </Form.Item>

//         <Form.Item
//           label="Description"
//           name="description"
//           rules={[{ required: true, message: 'Please enter description' }]}
//         >
//           <TextArea rows={4} />
//         </Form.Item>

//         <Form.Item
//           label="Organizer"
//           name="organizer"
//           rules={[{ required: true, message: 'Please enter organizer name' }]}
//         >
//           <Input />
//         </Form.Item>

//         <Form.Item
//           label="Location"
//           name="location"
//           rules={[{ required: true, message: 'Please enter location' }]}
//         >
//           <Input />
//         </Form.Item>

//         <Form.Item
//           label="Date"
//           name="date"
//           rules={[{ required: true, message: 'Please pick a date' }]}
//         >
//           <DatePicker style={{ width: '100%' }} />
//         </Form.Item>

//         <Form.Item
//           label="Type"
//           name="type"
//           rules={[{ required: true, message: 'Please enter event type' }]}
//         >
//           <Input placeholder="e.g. Cultural Fest, Tech Talk…" />
//         </Form.Item>

//         <Form.Item
//           label="Apply Link"
//           name="applyLink"
//           rules={[{ required: true, message: 'Please enter application URL' }]}
//         >
//           <Input />
//         </Form.Item>

//         {/* Banner Images section */}
//         <Form.Item label="Banner Images">
//           {banners.map((b, i) => (
//             <div key={i} style={{ marginBottom: 8, position: 'relative' }}>
//               <img
//                 src={b.url}
//                 alt={`banner-${i}`}
//                 style={{ maxWidth: '100%', borderRadius: 4 }}
//               />
//               <Button
//                 icon={<CloseCircleOutlined />}
//                 onClick={() => handleRemoveImage(i)}
//                 type="text"
//                 danger
//                 style={{ position: 'absolute', top: 8, right: 8 }}
//               />
//             </div>
//           ))}

//           <Button
//             icon={<UploadOutlined />}
//             onClick={() => {
//               setUploadingIndex(banners.length);
//               setShowImageModal(true);
//             }}
//           >
//             {banners.length === 0
//               ? 'Upload Banner Image'
//               : `Add Banner Image #${banners.length + 1}`}
//           </Button>
//         </Form.Item>

//         <Form.Item>
//           <Button type="primary" htmlType="submit">
//             Save Event
//           </Button>
//         </Form.Item>
//       </Form>

//       {/* Image Upload Modal */}
//       <Modal
//         title={`Upload Image #${uploadingIndex + 1}`}
//         open={showImageModal}
//         onCancel={() => setShowImageModal(false)}
//         footer={null}
//         destroyOnClose
//       >
//         <Upload.Dragger
//           beforeUpload={file => startImageUpload(uploadingIndex, file as File)}
//           showUploadList={false}
//           disabled={uploading}
//         >
//           <p className="ant-upload-drag-icon">
//             <UploadOutlined />
//           </p>
//           <p>Click or drag to upload</p>
//         </Upload.Dragger>

//         {uploading && <Progress percent={uploadProgress} />}
//       </Modal>
//     </div>
//   );
// };

// export default NewEvent;


