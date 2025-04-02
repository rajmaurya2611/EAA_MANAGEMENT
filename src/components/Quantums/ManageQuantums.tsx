// import React, { useEffect, useState } from 'react';
// import {
//   Select,
//   Button,
//   Table,
//   message,
//   Spin,
//   Modal,
//   Form,
//   Input,
//   Popconfirm,
// } from 'antd';
// import { DeleteOutlined, SearchOutlined } from '@ant-design/icons';
// import { db } from '../../firebaseConfig';
// import { ref as dbRef, onValue, update, remove } from 'firebase/database';
// import CryptoJS from 'crypto-js';

// const { Option } = Select;

// const QUANTUM_AES_SECRET_KEY = import.meta.env.VITE_MATERIALS_AES_SECRET_KEY;

// const decryptAES = (encryptedText: string): string => {
//   try {
//     const key = CryptoJS.enc.Utf8.parse(QUANTUM_AES_SECRET_KEY);
//     const decrypted = CryptoJS.AES.decrypt(encryptedText, key, {
//       mode: CryptoJS.mode.ECB,
//       padding: CryptoJS.pad.Pkcs7,
//     });
//     return decrypted.toString(CryptoJS.enc.Utf8);
//   } catch (error) {
//     console.error('Decryption failed:', error);
//     return encryptedText;
//   }
// };

// const encryptAES = (plainText: string): string => {
//   try {
//     const key = CryptoJS.enc.Utf8.parse(QUANTUM_AES_SECRET_KEY);
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

// const ManageQuantums: React.FC = () => {
//   const [selectedYear, setSelectedYear] = useState<string>('');
//   const [selectedBranch, setSelectedBranch] = useState<string>('');
//   const [branches, setBranches] = useState<string[]>([]);
//   const [quantumData, setQuantumData] = useState<any[]>([]);
//   const [loading, setLoading] = useState<boolean>(false);
//   const [editModalVisible, setEditModalVisible] = useState(false);
//   const [editingNote, setEditingNote] = useState<any>(null);
//   const [editForm] = Form.useForm();
//   const [searchText, setSearchText] = useState('');
//   const [totalQuantumCount, setTotalQuantumCount] = useState<number>(0);

//   const years = ['First_Year', 'Second_Year', 'Third_Year', 'Fourth_Year'];

//   useEffect(() => {
//     if (selectedYear) {
//       const yearRef = dbRef(db, `version12/Materials/Quantum/${selectedYear}`);
//       onValue(yearRef, (snapshot) => {
//         const data = snapshot.val();
//         if (data) {
//           setBranches(Object.keys(data));
//         } else {
//           setBranches([]);
//         }
//       });
//     }
//   }, [selectedYear]);

//   const handleApply = () => {
//     if (!selectedYear || !selectedBranch) {
//       message.warning('Please select both year and branch.');
//       return;
//     }
//     setLoading(true);
//     const quantumRef = dbRef(db, `version12/Materials/Quantum/${selectedYear}/${selectedBranch}`);
//     onValue(quantumRef, (snapshot) => {
//       const data = snapshot.val();
//       if (data) {
//         const quantumList = Object.values(data).map((note: any) => ({
//           key: note.id,
//           id: note.id,
//           by: decryptAES(note.by),
//           date: note.date,
//           dislikes: note.dislikes,
//           likes: note.likes,
//           pdf: decryptAES(note.pdf),
//           sub_code: decryptAES(note.sub_code),
//           sub_name: decryptAES(note.sub_name),
//         }));
//         setQuantumData(quantumList);
//         setTotalQuantumCount(quantumList.length);
//       } else {
//         setQuantumData([]);
//         setTotalQuantumCount(0);
//       }
//       setLoading(false);
//     });
//   };

//   const handleEdit = (record: any) => {
//     setEditingNote(record);
//     editForm.setFieldsValue({
//       sub_name: record.sub_name,
//       sub_code: record.sub_code,
//       pdf: record.pdf,
//       by: record.by,
//       likes: record.likes,
//       dislikes: record.dislikes,
//     });
//     setEditModalVisible(true);
//   };

//   const handleUpdate = async () => {
//     try {
//       const values = await editForm.validateFields();
//       const path = `version12/Materials/Quantum/${selectedYear}/${selectedBranch}/${editingNote.id}`;
//       const updatedData = {
//         id: editingNote.id,
//         date: new Date().toLocaleDateString(),
//         by: encryptAES(values.by),
//         pdf: encryptAES(values.pdf),
//         sub_code: encryptAES(values.sub_code),
//         sub_name: encryptAES(values.sub_name),
//         likes: Number(values.likes),
//         dislikes: Number(values.dislikes),
//       };
//       await update(dbRef(db, path), updatedData);
//       message.success('Note updated successfully');
//       setEditModalVisible(false);
//       handleApply();
//     } catch (error) {
//       message.error('Failed to update note');
//     }
//   };

//   const handleDelete = async (noteId: string) => {
//     const path = `version12/Materials/Quantum/${selectedYear}/${selectedBranch}/${noteId}`;
//     try {
//       await remove(dbRef(db, path));
//       message.success('Note deleted successfully');
//       handleApply();
//     } catch (error) {
//       message.error('Failed to delete note');
//     }
//   };

//   const filteredQuantum = quantumData.filter((quantum) => {
//     const searchLower = searchText.toLowerCase();
//     return (
//       quantum.sub_name.toLowerCase().includes(searchLower) ||
//       quantum.sub_code.toLowerCase().includes(searchLower) ||
//       quantum.by.toLowerCase().includes(searchLower)
//     );
//   });

//   const columns = [
//     { title: 'Subject Name', dataIndex: 'sub_name', key: 'sub_name' },
//     { title: 'Subject Code', dataIndex: 'sub_code', key: 'sub_code' },
//     {
//       title: 'PDF Link',
//       dataIndex: 'pdf',
//       key: 'pdf',
//       render: (text: string) => (
//         <a href={text} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
//           Open
//         </a>
//       ),
//     },
//     { title: 'By', dataIndex: 'by', key: 'by' },
//     { title: 'Date', dataIndex: 'date', key: 'date' },
//     { title: 'Likes', dataIndex: 'likes', key: 'likes' },
//     { title: 'Dislikes', dataIndex: 'dislikes', key: 'dislikes' },
//     {
//       title: 'Action',
//       key: 'action',
//       render: (_: any, record: any) => (
//         <div className="flex items-center gap-2">
//           <Button type="default" onClick={() => handleEdit(record)}>
//             Edit
//           </Button>
//           <Popconfirm
//             title="Are you sure you want to delete this note?"
//             onConfirm={() => handleDelete(record.id)}
//             okText="Yes"
//             cancelText="No"
//           >
//             <Button type="link" danger>
//               <DeleteOutlined className="text-lg " />
//             </Button>
//           </Popconfirm>
//         </div>
//       ),
//     },
//   ];

//   return (
//     <div style={{ padding: '24px', background: '#fff', minHeight: '80vh' }}>
//       <h2 className="text-xl font-bold mb-4">Manage Quantum</h2>
//       {/* Top Row: Year, Branch, Apply, Search */}
//       <div style={{ marginBottom: '24px', display: 'flex', gap: '16px', alignItems: 'center', justifyContent: 'space-between' }}>
//         <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
//           <Select
//             placeholder="Select Year"
//             style={{ width: 200 }}
//             value={selectedYear || undefined}
//             onChange={(value) => {
//               setSelectedYear(value);
//               setSelectedBranch('');
//               setQuantumData([]);
//               setTotalQuantumCount(0);
//             }}
//           >
//             {years.map((year) => (
//               <Option key={year} value={year}>
//                 {year.replace('_', ' ')}
//               </Option>
//             ))}
//           </Select>

//           <Select
//             placeholder="Select Branch"
//             style={{ width: 200 }}
//             value={selectedBranch || undefined}
//             onChange={(value) => setSelectedBranch(value)}
//             disabled={!selectedYear}
//           >
//             {branches.map((branch) => (
//               <Option key={branch} value={branch}>
//                 {branch}
//               </Option>
//             ))}
//           </Select>

//           <Button type="primary" onClick={handleApply}>
//             Apply
//           </Button>
//         </div>

//         <Input
//           placeholder=" Search by Subject Name/Subject Code/By"
//           className="w-full max-w-md"
//           value={searchText}
//           prefix={<SearchOutlined className="text-gray-400" />}
//           onChange={(e) => setSearchText(e.target.value)}
//         />
//       </div>

//       {/* Selected info and total quantum */}
//       <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
//         <div>
//           <strong>Selected:</strong> {selectedYear.replace('_', ' ')} / {selectedBranch || 'None'}
//         </div>
//         <div style={{ fontWeight: 'bold' }}>Total Quantum: {totalQuantumCount}</div>
//       </div>

//       <Spin spinning={loading}>
//         <Table columns={columns} dataSource={filteredQuantum} pagination={{ pageSize: 8 }} />
//       </Spin>

//       <Modal
//         title="Edit Note"
//         open={editModalVisible}
//         onCancel={() => setEditModalVisible(false)}
//         onOk={handleUpdate}
//         okText="Save"
//       >
//         <Form form={editForm} layout="vertical">
//           <Form.Item label="Subject Name" name="sub_name" rules={[{ required: true }]}>
//             <Input />
//           </Form.Item>
//           <Form.Item label="Subject Code" name="sub_code" rules={[{ required: true }]}>
//             <Input />
//           </Form.Item>
//           <Form.Item label="PDF Link" name="pdf" rules={[{ required: true }]}>
//             <Input />
//           </Form.Item>
//           <Form.Item label="By" name="by" rules={[{ required: true }]}>
//             <Input />
//           </Form.Item>
//           <Form.Item label="Likes" name="likes" rules={[{ required: true }]}>
//             <Input type="number" />
//           </Form.Item>
//           <Form.Item label="Dislikes" name="dislikes" rules={[{ required: true }]}>
//             <Input type="number" />
//           </Form.Item>
//         </Form>
//       </Modal>
//     </div>
//   );
// };

// export default ManageQuantums;


function ManageNotes() {
  return (
    <div>
      <h2>Manage Carousel</h2>
      {/* Add your UI for managing existing carousels here */}
    </div>
  );
}

export default ManageNotes;
