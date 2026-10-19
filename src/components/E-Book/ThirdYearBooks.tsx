import React, { useState, useEffect } from 'react';
import {
  Layout,
  Menu,
  Spin,
  Button,
  Modal,
  Form,
  Input,
  message,
  Upload,
  Switch,
  Progress,
} from 'antd';
import type { UploadProps } from 'antd';
import type { UploadRequestOption as RcUploadRequestOption } from 'rc-upload/lib/interface';

import { db } from '../../firebaseConfig';
import { ref as dbRef, onValue, push, set } from 'firebase/database';

import {
  getStorage,
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
} from 'firebase/storage';

import CryptoJS from 'crypto-js';

const { Sider, Content } = Layout;

// Get your secret key from environment variables
const BOOKS_AES_SECRET_KEY = import.meta.env.VITE_MATERIALS_AES_SECRET_KEY;

// Encryption function for text fields
const encryptAES = (plainText: string): string => {
  try {
    const key = CryptoJS.enc.Utf8.parse(BOOKS_AES_SECRET_KEY);
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

interface BranchBooks {
  branch: string;
  books: { [noteId: string]: any };
}

const ThirdYearBooks: React.FC = () => {
  const [branches, setBranches] = useState<BranchBooks[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  // Modal state for adding a new branch/subject note (two-step modal)
  const [showAddSubjectModal, setShowAddSubjectModal] = useState<boolean>(false);
  const [modalStep, setModalStep] = useState<number>(1); // 1: Branch name, 2: Subject details for new branch addition
  const [newBranchName, setNewBranchName] = useState<string>('');
  const [branchForm] = Form.useForm();
  const [subjectModalForm] = Form.useForm();
  // Subject note form in content area (always visible)
  const [subjectForm] = Form.useForm();
  // Success modal for subject note addition from content area
  const [showSubjectSuccessModal, setShowSubjectSuccessModal] =
    useState<boolean>(false);

  /* ---------------------------------------
   * FireStorage additions (ONLY added)
   * --------------------------------------- */
  const storage = getStorage();

  const [useUploadPdf, setUseUploadPdf] = useState<boolean>(true);
  const [useUploadPdfModal, setUseUploadPdfModal] = useState<boolean>(true);

  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const [uploadingPdfModal, setUploadingPdfModal] = useState(false);
  const [uploadProgressModal, setUploadProgressModal] = useState(0);

  const sanitizePathPart = (s: string) =>
    (s || 'unknown').trim().replace(/[.#$[\]/\\]/g, '_');

  const sanitizeFileName = (name: string) =>
    (name || 'file.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');

  // Storage path aligned with DB:
  // version12/Materials/E-Book/Third_Year/<branch>/pdf/<timestamp>_<filename>
  const buildStoragePath = (branch: string, file: File) => {
    const safeBranch = sanitizePathPart(branch);
    const safeName = sanitizeFileName(file.name);
    return `version12/Materials/E-Book/Third_Year/${safeBranch}/pdf/${Date.now()}_${safeName}`;
  };

  const uploadPdfAndFillField = async (
    file: File,
    branch: string,
    form: any,
    setUploading: (v: boolean) => void,
    setProgress: (v: number) => void
  ) => {
    const isPdf =
      file?.type === 'application/pdf' ||
      file?.name?.toLowerCase().endsWith('.pdf');
    if (!isPdf) throw new Error('Only PDF files are allowed');
    if (!branch?.trim()) throw new Error('Branch missing');

    setUploading(true);
    setProgress(0);

    const path = buildStoragePath(branch, file);
    const sRef = storageRef(storage, path);

    return await new Promise<string>((resolve, reject) => {
      const task = uploadBytesResumable(sRef, file, {
        contentType: 'application/pdf',
      });

      task.on(
        'state_changed',
        (snap) => {
          const pct = Math.round(
            (snap.bytesTransferred / snap.totalBytes) * 100
          );
          setProgress(pct);
        },
        (err) => {
          setUploading(false);
          reject(err);
        },
        async () => {
          try {
            const url = await getDownloadURL(task.snapshot.ref);
            form.setFieldsValue({ pdf: url }); // auto-fill existing field
            setUploading(false);
            resolve(url);
          } catch (err) {
            setUploading(false);
            reject(err);
          }
        }
      );
    });
  };

  // IMPORTANT: call onSuccess/onError so AntD removes the spinning circle
  const makeCustomRequest =
    (
      branchGetter: () => string,
      form: any,
      setUploading: (v: boolean) => void,
      setProgress: (v: number) => void
    ): UploadProps['customRequest'] =>
    async (options: RcUploadRequestOption) => {
      const { file, onError, onSuccess } = options;
      try {
        await uploadPdfAndFillField(
          file as File,
          branchGetter(),
          form,
          setUploading,
          setProgress
        );
        message.success('PDF uploaded & link generated.');
        onSuccess?.({ ok: true } as any);
      } catch (err: any) {
        console.error('Upload failed:', err);
        message.error(err?.message || 'PDF upload failed.');
        onError?.(err);
      }
    };

  const resetUploadUIContent = () => {
    setUploadingPdf(false);
    setUploadProgress(0);
  };

  const resetUploadUIModal = () => {
    setUploadingPdfModal(false);
    setUploadProgressModal(0);
  };

  /* ---------------------------------------
   * Existing Firebase DB logic (UNCHANGED)
   * --------------------------------------- */

  // Listen for branches at the specified path
  useEffect(() => {
    const booksRef = dbRef(db, 'version12/Materials/E-Book/Third_Year');
    const unsubscribe = onValue(booksRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const branchList: BranchBooks[] = Object.keys(data).map((branch) => ({
          branch,
          books: data[branch],
        }));
        setBranches(branchList);
        if (branchList.length > 0 && !selectedBranch) {
          setSelectedBranch(branchList[0].branch);
        }
      } else {
        setBranches([]);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [selectedBranch]);

  const handleMenuClick = ({ key }: { key: string }) => {
    setSelectedBranch(key);
    // keep UX clean on branch switch
    subjectForm.setFieldsValue({ pdf: '' });
    resetUploadUIContent();
  };

  // --- Two-Step Modal for Adding a New Branch & Subject Note ---
  // Step 1: Enter Branch Name
  const onFinishStep1 = (values: any) => {
    const branchName = values.branchName.trim();
    if (!branchName) {
      message.error('Please enter a valid branch name.');
      return;
    }
    setNewBranchName(branchName);
    // Proceed to step 2
    setModalStep(2);
  };

  // Step 2: Enter Subject Details for the new branch (including "By")
  const onFinishStep2 = async (values: any) => {
    const { pdf, sub_code, sub_name, by } = values;
    if (!pdf || !sub_code || !sub_name || !by) {
      message.error('Please fill all the required fields.');
      return;
    }
    const current = new Date();
    const dateStr = current.toLocaleDateString();
    // Encrypt the fields before saving
    const encryptedPdf = encryptAES(pdf);
    const encryptedSubCode = encryptAES(sub_code);
    const encryptedSubName = encryptAES(sub_name);
    const encryptedBy = encryptAES(by);
    // The path for the new subject will be: version12/Materials/E-Book/Third_Year/<newBranchName>
    const branchPath = `version12/Materials/E-Book/Third_Year/${newBranchName}`;
    const newSubjectRef = push(dbRef(db, branchPath));
    const newSubjectId = newSubjectRef.key;
    const subjectData = {
      by: encryptedBy,
      date: dateStr,
      dislikes: 0,
      likes: 0,
      id: newSubjectId,
      pdf: encryptedPdf,
      sub_code: encryptedSubCode,
      sub_name: encryptedSubName,
    };

    try {
      await set(newSubjectRef, subjectData);
      message.success('Subject added successfully under new branch!');
      // Optionally, set the newly created branch as selected:
      setSelectedBranch(newBranchName);
      // Reset the modal
      setTimeout(() => {
        branchForm.resetFields();
        subjectModalForm.resetFields();
        setModalStep(1);
        setShowAddSubjectModal(false);

        resetUploadUIModal();
      }, 1000);
    } catch (error) {
      message.error('Failed to add subject');
    }
  };

  const handleModalCancel = () => {
    setShowAddSubjectModal(false);
    setModalStep(1);
    branchForm.resetFields();
    subjectModalForm.resetFields();

    resetUploadUIModal();
  };

  // --- Subject Note Form in Content Area (Always Visible) ---
  const onFinishSubject = async (values: any) => {
    if (!selectedBranch) {
      message.error('No branch selected.');
      return;
    }
    const { pdf, sub_code, sub_name, by } = values;
    if (!pdf || !sub_code || !sub_name || !by) {
      message.error('Please fill in all fields.');
      return;
    }
    const current = new Date();
    const dateStr = current.toLocaleDateString();
    // Encrypt the fields before saving
    const encryptedPdf = encryptAES(pdf);
    const encryptedSubCode = encryptAES(sub_code);
    const encryptedSubName = encryptAES(sub_name);
    const encryptedBy = encryptAES(by);
    const branchPath = `version12/Materials/E-Book/Third_Year/${selectedBranch}`;
    const newNoteRef = push(dbRef(db, branchPath));
    const newNoteId = newNoteRef.key;
    const noteData = {
      by: encryptedBy,
      date: dateStr,
      dislikes: 0,
      likes: 0,
      id: newNoteId,
      pdf: encryptedPdf,
      sub_code: encryptedSubCode,
      sub_name: encryptedSubName,
    };

    try {
      await set(newNoteRef, noteData);
      message.success('Subject note added successfully!');
      setShowSubjectSuccessModal(true);
      setTimeout(() => {
        subjectForm.resetFields();
        setShowSubjectSuccessModal(false);

        resetUploadUIContent();
      }, 1000);
    } catch (error) {
      message.error('Failed to add subject note.');
    }
  };

  const onSubjectCancel = () => {
    subjectForm.resetFields();
    resetUploadUIContent();
  };

  return (
    <Layout style={{ minHeight: '70vh' }}>
      <Sider width={250} style={{ background: '#fff', paddingBottom: '24px' }}>
        {/* Sidebar code remains unchanged */}
        {/* For brevity, assume the sidebar remains the same as in your current code */}
        <Spin spinning={loading} style={{ margin: '20px' }}>
          <Menu
            mode="inline"
            selectedKeys={[selectedBranch]}
            onClick={handleMenuClick}
            style={{ height: 'calc(100% - 50px)', borderRight: 0 }}
          >
            {branches.map((branchObj) => (
              <Menu.Item key={branchObj.branch}>{branchObj.branch}</Menu.Item>
            ))}
          </Menu>
          <Button
            type="dashed"
            style={{ width: '90%', margin: '10px' }}
            onClick={() => {
              setShowAddSubjectModal(true);
              setModalStep(1);
            }}
          >
            Add Subject
          </Button>
        </Spin>
      </Sider>

      <Layout style={{ padding: '24px' }}>
        <Content style={{ background: '#fff', padding: 24, minHeight: 280 }}>
          <h2>Add Subject Note to {selectedBranch}</h2>
          <Form
            form={subjectForm}
            layout="vertical"
            onFinish={onFinishSubject}
            initialValues={{ by: 'Admin' }}
          >
            <Form.Item
              label="By"
              name="by"
              rules={[{ required: true, message: 'Please enter the author name' }]}
            >
              <Input placeholder="Enter author name" />
            </Form.Item>

            {/* NEW: Upload/Link toggle */}
            <Form.Item label="PDF Input Mode">
              <Switch
                checked={useUploadPdf}
                onChange={(v) => {
                  setUseUploadPdf(v);
                  subjectForm.setFieldsValue({ pdf: '' });
                  resetUploadUIContent();
                }}
                checkedChildren="Upload"
                unCheckedChildren="Link"
              />
            </Form.Item>

            {useUploadPdf ? (
              <>
                <Form.Item label="Upload PDF">
                  <Upload.Dragger
                    accept="application/pdf"
                    multiple={false}
                    maxCount={1}
                    customRequest={makeCustomRequest(
                      () => selectedBranch,
                      subjectForm,
                      setUploadingPdf,
                      setUploadProgress
                    )}
                    onRemove={() => {
                      subjectForm.setFieldsValue({ pdf: '' });
                      resetUploadUIContent();
                      return true;
                    }}
                  >
                    <p style={{ marginBottom: 0 }}>
                      Drag & drop a PDF here, or click to select
                    </p>
                  </Upload.Dragger>

                  {uploadingPdf && <Progress percent={uploadProgress} />}
                </Form.Item>

                <Form.Item
                  label="PDF Link"
                  name="pdf"
                  rules={[
                    {
                      required: true,
                      message: 'Please upload a PDF to auto-generate the link',
                    },
                  ]}
                >
                  <Input
                    readOnly
                    placeholder="Upload will auto-fill the download URL"
                  />
                </Form.Item>
              </>
            ) : (
              <Form.Item
                label="PDF Link"
                name="pdf"
                rules={[{ required: true, message: 'Please enter the PDF link' }]}
              >
                <Input placeholder="Enter PDF link" />
              </Form.Item>
            )}

            <Form.Item
              label="Subject Code"
              name="sub_code"
              rules={[{ required: true, message: 'Please enter the subject code' }]}
            >
              <Input placeholder="Enter subject code" />
            </Form.Item>
            <Form.Item
              label="Subject Name"
              name="sub_name"
              rules={[{ required: true, message: 'Please enter the subject name' }]}
            >
              <Input placeholder="Enter subject name" />
            </Form.Item>

            <Form.Item>
              <Button type="primary" htmlType="submit">
                Add Subject Note
              </Button>
              <Button onClick={onSubjectCancel} style={{ marginLeft: '10px' }}>
                Cancel
              </Button>
            </Form.Item>
          </Form>
        </Content>
      </Layout>

      {/* Two-Step Modal for adding a new branch & subject details */}
      <Modal
        open={showAddSubjectModal}
        title="Add New Subject"
        onCancel={handleModalCancel}
        footer={null}
      >
        {modalStep === 1 && (
          <Form form={branchForm} layout="vertical" onFinish={onFinishStep1}>
            <Form.Item
              label="Branch Name"
              name="branchName"
              rules={[{ required: true, message: 'Please enter the branch name' }]}
            >
              <Input placeholder="Enter branch name" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit">
                Next
              </Button>
            </Form.Item>
          </Form>
        )}

        {modalStep === 2 && (
          <Form
            form={subjectModalForm}
            layout="vertical"
            onFinish={onFinishStep2}
            initialValues={{ by: 'Admin' }}
          >
            <Form.Item
              label="By"
              name="by"
              rules={[{ required: true, message: 'Please enter the author name' }]}
            >
              <Input placeholder="Enter author name" />
            </Form.Item>

            {/* NEW: Upload/Link toggle in modal */}
            <Form.Item label="PDF Input Mode">
              <Switch
                checked={useUploadPdfModal}
                onChange={(v) => {
                  setUseUploadPdfModal(v);
                  subjectModalForm.setFieldsValue({ pdf: '' });
                  resetUploadUIModal();
                }}
                checkedChildren="Upload"
                unCheckedChildren="Link"
              />
            </Form.Item>

            {useUploadPdfModal ? (
              <>
                <Form.Item label="Upload PDF">
                  <Upload.Dragger
                    accept="application/pdf"
                    multiple={false}
                    maxCount={1}
                    customRequest={makeCustomRequest(
                      () => newBranchName,
                      subjectModalForm,
                      setUploadingPdfModal,
                      setUploadProgressModal
                    )}
                    onRemove={() => {
                      subjectModalForm.setFieldsValue({ pdf: '' });
                      resetUploadUIModal();
                      return true;
                    }}
                  >
                    <p style={{ marginBottom: 0 }}>
                      Drag & drop a PDF here, or click to select
                    </p>
                  </Upload.Dragger>

                  {uploadingPdfModal && (
                    <Progress percent={uploadProgressModal} />
                  )}
                </Form.Item>

                <Form.Item
                  label="PDF Link"
                  name="pdf"
                  rules={[
                    {
                      required: true,
                      message: 'Please upload a PDF to auto-generate the link',
                    },
                  ]}
                >
                  <Input
                    readOnly
                    placeholder="Upload will auto-fill the download URL"
                  />
                </Form.Item>
              </>
            ) : (
              <Form.Item
                label="PDF Link"
                name="pdf"
                rules={[{ required: true, message: 'Please enter the PDF link' }]}
              >
                <Input placeholder="Enter PDF link" />
              </Form.Item>
            )}

            <Form.Item
              label="Subject Code"
              name="sub_code"
              rules={[{ required: true, message: 'Please enter the subject code' }]}
            >
              <Input placeholder="Enter subject code" />
            </Form.Item>
            <Form.Item
              label="Subject Name"
              name="sub_name"
              rules={[{ required: true, message: 'Please enter the subject name' }]}
            >
              <Input placeholder="Enter subject name" />
            </Form.Item>

            <Form.Item>
              <Button type="primary" htmlType="submit">
                Add Subject
              </Button>
            </Form.Item>
          </Form>
        )}
      </Modal>

      {/* Success Modal for Subject Note Addition */}
      <Modal
        open={showSubjectSuccessModal}
        title="Success"
        onOk={() => setShowSubjectSuccessModal(false)}
        onCancel={() => setShowSubjectSuccessModal(false)}
        footer={[
          <Button
            key="ok"
            type="primary"
            onClick={() => setShowSubjectSuccessModal(false)}
          >
            OK
          </Button>,
        ]}
      >
        <p>Your subject note has been added successfully!</p>
      </Modal>
    </Layout>
  );
};

export default ThirdYearBooks;


// import React, { useState, useEffect } from 'react';
// import { Layout, Menu, Spin, Button, Modal, Form, Input, message } from 'antd';
// import { db } from '../../firebaseConfig';
// import { ref as dbRef, onValue, push, set } from 'firebase/database';
// import CryptoJS from 'crypto-js';

// const { Sider, Content } = Layout;

// // Get your secret key from environment variables
// const BOOKS_AES_SECRET_KEY = import.meta.env.VITE_MATERIALS_AES_SECRET_KEY;

// // Encryption function for text fields
// const encryptAES = (plainText: string): string => {
//   try {
//     const key = CryptoJS.enc.Utf8.parse(BOOKS_AES_SECRET_KEY);
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

// interface BranchBooks {
//   branch: string;
//   books: { [noteId: string]: any };
// }

// const ThirdYearBooks: React.FC = () => {
//   const [branches, setBranches] = useState<BranchBooks[]>([]);
//   const [selectedBranch, setSelectedBranch] = useState<string>('');
//   const [loading, setLoading] = useState<boolean>(true);
//   // Modal state for adding a new branch/subject note (two-step modal)
//   const [showAddSubjectModal, setShowAddSubjectModal] = useState<boolean>(false);
//   const [modalStep, setModalStep] = useState<number>(1); // 1: Branch name, 2: Subject details for new branch addition
//   const [newBranchName, setNewBranchName] = useState<string>('');
//   const [branchForm] = Form.useForm();
//   const [subjectModalForm] = Form.useForm();
//   // Subject note form in content area (always visible)
//   const [subjectForm] = Form.useForm();
//   // Success modal for subject note addition from content area
//   const [showSubjectSuccessModal, setShowSubjectSuccessModal] = useState<boolean>(false);

//   // Listen for branches at the specified path
//   useEffect(() => {
//     const booksRef = dbRef(db, 'version12/Materials/E-Book/Third_Year');
//     const unsubscribe = onValue(booksRef, (snapshot) => {
//       const data = snapshot.val();
//       if (data) {
//         const branchList: BranchBooks[] = Object.keys(data).map((branch) => ({
//           branch,
//           books: data[branch],
//         }));
//         setBranches(branchList);
//         if (branchList.length > 0 && !selectedBranch) {
//           setSelectedBranch(branchList[0].branch);
//         }
//       } else {
//         setBranches([]);
//       }
//       setLoading(false);
//     });
//     return () => unsubscribe();
//   }, [selectedBranch]);

//   const handleMenuClick = ({ key }: { key: string }) => {
//     setSelectedBranch(key);
//   };

//   // --- Two-Step Modal for Adding a New Branch & Subject Note ---
//   // Step 1: Enter Branch Name
//   const onFinishStep1 = (values: any) => {
//     const branchName = values.branchName.trim();
//     if (!branchName) {
//       message.error('Please enter a valid branch name.');
//       return;
//     }
//     setNewBranchName(branchName);
//     // Proceed to step 2
//     setModalStep(2);
//   };

//   // Step 2: Enter Subject Details for the new branch (including "By")
//   const onFinishStep2 = async (values: any) => {
//     const { pdf, sub_code, sub_name, by } = values;
//     if (!pdf || !sub_code || !sub_name || !by) {
//       message.error('Please fill all the required fields.');
//       return;
//     }
//     const current = new Date();
//     const dateStr = current.toLocaleDateString();
//     // Encrypt the fields before saving
//     const encryptedPdf = encryptAES(pdf);
//     const encryptedSubCode = encryptAES(sub_code);
//     const encryptedSubName = encryptAES(sub_name);
//     const encryptedBy = encryptAES(by);
//     // The path for the new subject will be: version12/Materials/E-Book/Third_Year/<newBranchName>
//     const branchPath = `version12/Materials/E-Book/Third_Year/${newBranchName}`;
//     const newSubjectRef = push(dbRef(db, branchPath));
//     const newSubjectId = newSubjectRef.key;
//     const subjectData = {
//       by: encryptedBy,
//       date: dateStr,
//       dislikes: 0,
//       likes: 0,
//       id: newSubjectId,
//       pdf: encryptedPdf,
//       sub_code: encryptedSubCode,
//       sub_name: encryptedSubName,
//     };

//     try {
//       await set(newSubjectRef, subjectData);
//       message.success('Subject added successfully under new branch!');
//       // Optionally, set the newly created branch as selected:
//       setSelectedBranch(newBranchName);
//       // Reset the modal
//       setTimeout(() => {
//         branchForm.resetFields();
//         subjectModalForm.resetFields();
//         setModalStep(1);
//         setShowAddSubjectModal(false);
//       }, 1000);
//     } catch (error) {
//       message.error('Failed to add subject');
//     }
//   };

//   const handleModalCancel = () => {
//     setShowAddSubjectModal(false);
//     setModalStep(1);
//     branchForm.resetFields();
//     subjectModalForm.resetFields();
//   };

//   // --- Subject Note Form in Content Area (Always Visible) ---
//   const onFinishSubject = async (values: any) => {
//     if (!selectedBranch) {
//       message.error('No branch selected.');
//       return;
//     }
//     const { pdf, sub_code, sub_name, by } = values;
//     if (!pdf || !sub_code || !sub_name || !by) {
//       message.error('Please fill in all fields.');
//       return;
//     }
//     const current = new Date();
//     const dateStr = current.toLocaleDateString();
//     // Encrypt the fields before saving
//     const encryptedPdf = encryptAES(pdf);
//     const encryptedSubCode = encryptAES(sub_code);
//     const encryptedSubName = encryptAES(sub_name);
//     const encryptedBy = encryptAES(by);
//     const branchPath = `version12/Materials/E-Book/Third_Year/${selectedBranch}`;
//     const newNoteRef = push(dbRef(db, branchPath));
//     const newNoteId = newNoteRef.key;
//     const noteData = {
//       by: encryptedBy,
//       date: dateStr,
//       dislikes: 0,
//       likes: 0,
//       id: newNoteId,
//       pdf: encryptedPdf,
//       sub_code: encryptedSubCode,
//       sub_name: encryptedSubName,
//     };

//     try {
//       await set(newNoteRef, noteData);
//       message.success('Subject note added successfully!');
//       setShowSubjectSuccessModal(true);
//       setTimeout(() => {
//         subjectForm.resetFields();
//         setShowSubjectSuccessModal(false);
//       }, 1000);
//     } catch (error) {
//       message.error('Failed to add subject note.');
//     }
//   };

//   const onSubjectCancel = () => {
//     subjectForm.resetFields();
//   };

//   return (
//     <Layout style={{ minHeight: '70vh' }}>
//       <Sider width={250} style={{ background: '#fff', paddingBottom: '24px' }}>
//         {/* Sidebar code remains unchanged */}
//         {/* For brevity, assume the sidebar remains the same as in your current code */}
//         <Spin spinning={loading} style={{ margin: '20px' }}>
//           <Menu
//             mode="inline"
//             selectedKeys={[selectedBranch]}
//             onClick={handleMenuClick}
//             style={{ height: 'calc(100% - 50px)', borderRight: 0 }}
//           >
//             {branches.map((branchObj) => (
//               <Menu.Item key={branchObj.branch}>{branchObj.branch}</Menu.Item>
//             ))}
//           </Menu>
//           <Button
//             type="dashed"
//             style={{ width: '90%', margin: '10px' }}
//             onClick={() => {
//               setShowAddSubjectModal(true);
//               setModalStep(1);
//             }}
//           >
//             Add Subject
//           </Button>
//         </Spin>
//       </Sider>
//       <Layout style={{ padding: '24px' }}>
//         <Content style={{ background: '#fff', padding: 24, minHeight: 280 }}>
//           <h2>Add Subject Note to {selectedBranch}</h2>
//           <Form
//             form={subjectForm}
//             layout="vertical"
//             onFinish={onFinishSubject}
//             initialValues={{ by: 'Admin' }}
//           >
//             <Form.Item
//               label="By"
//               name="by"
//               rules={[{ required: true, message: 'Please enter the author name' }]}
//             >
//               <Input placeholder="Enter author name" />
//             </Form.Item>
//             <Form.Item
//               label="PDF Link"
//               name="pdf"
//               rules={[{ required: true, message: 'Please enter the PDF link' }]}
//             >
//               <Input placeholder="Enter PDF link" />
//             </Form.Item>
//             <Form.Item
//               label="Subject Code"
//               name="sub_code"
//               rules={[{ required: true, message: 'Please enter the subject code' }]}
//             >
//               <Input placeholder="Enter subject code" />
//             </Form.Item>
//             <Form.Item
//               label="Subject Name"
//               name="sub_name"
//               rules={[{ required: true, message: 'Please enter the subject name' }]}
//             >
//               <Input placeholder="Enter subject name" />
//             </Form.Item>
//             <Form.Item>
//               <Button type="primary" htmlType="submit">
//                 Add Subject Note
//               </Button>
//               <Button onClick={onSubjectCancel} style={{ marginLeft: '10px' }}>
//                 Cancel
//               </Button>
//             </Form.Item>
//           </Form>
//         </Content>
//       </Layout>

//       {/* Two-Step Modal for adding a new branch & subject details */}
//       <Modal
//         open={showAddSubjectModal}
//         title="Add New Subject"
//         onCancel={handleModalCancel}
//         footer={null}
//       >
//         {modalStep === 1 && (
//           <Form form={branchForm} layout="vertical" onFinish={onFinishStep1}>
//             <Form.Item
//               label="Branch Name"
//               name="branchName"
//               rules={[{ required: true, message: 'Please enter the branch name' }]}
//             >
//               <Input placeholder="Enter branch name" />
//             </Form.Item>
//             <Form.Item>
//               <Button type="primary" htmlType="submit">
//                 Next
//               </Button>
//             </Form.Item>
//           </Form>
//         )}
//         {modalStep === 2 && (
//           <Form form={subjectModalForm} layout="vertical" onFinish={onFinishStep2} initialValues={{ by: 'Admin' }}>
//             <Form.Item
//               label="By"
//               name="by"
//               rules={[{ required: true, message: 'Please enter the author name' }]}
//             >
//               <Input placeholder="Enter author name" />
//             </Form.Item>
//             <Form.Item
//               label="PDF Link"
//               name="pdf"
//               rules={[{ required: true, message: 'Please enter the PDF link' }]}
//             >
//               <Input placeholder="Enter PDF link" />
//             </Form.Item>
//             <Form.Item
//               label="Subject Code"
//               name="sub_code"
//               rules={[{ required: true, message: 'Please enter the subject code' }]}
//             >
//               <Input placeholder="Enter subject code" />
//             </Form.Item>
//             <Form.Item
//               label="Subject Name"
//               name="sub_name"
//               rules={[{ required: true, message: 'Please enter the subject name' }]}
//             >
//               <Input placeholder="Enter subject name" />
//             </Form.Item>
//             <Form.Item>
//               <Button type="primary" htmlType="submit">
//                 Add Subject
//               </Button>
//             </Form.Item>
//           </Form>
//         )}
//       </Modal>

//       {/* Success Modal for Subject Note Addition */}
//       <Modal
//         open={showSubjectSuccessModal}
//         title="Success"
//         onOk={() => setShowSubjectSuccessModal(false)}
//         onCancel={() => setShowSubjectSuccessModal(false)}
//         footer={[
//           <Button key="ok" type="primary" onClick={() => setShowSubjectSuccessModal(false)}>
//             OK
//           </Button>,
//         ]}
//       >
//         <p>Your subject note has been added successfully!</p>
//       </Modal>
//     </Layout>
//   );
// };

// export default ThirdYearBooks;
