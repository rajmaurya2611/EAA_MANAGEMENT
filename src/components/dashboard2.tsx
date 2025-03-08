import React, { useState, useEffect } from "react";
import { Table } from "antd";
import type { TableColumnsType } from "antd";
import { getDatabase, ref, onValue, off, DataSnapshot } from "firebase/database";
import CryptoJS from "crypto-js";

const AES_SECRET_KEY = import.meta.env.VITE_AES_SECRET_KEY
 // Must match Android encryption key

const decryptAES = (encryptedText: string) => {
  try {
    const key = CryptoJS.enc.Utf8.parse(AES_SECRET_KEY);
    const decrypted = CryptoJS.AES.decrypt(encryptedText, key, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    });

    const decryptedText = decrypted.toString(CryptoJS.enc.Utf8);
    return decryptedText || encryptedText;
  } catch (error) {
    console.warn(`Skipping decryption for: ${encryptedText}`);
    return encryptedText;
  }
};

// Define UserData type
interface UserData {
  key: string;
  name: string;
  year: string;
  email: string;
  college: string;
  branch: string;
  registrationType: string;
  registrationDate: string;
}

const UserDashboard: React.FC = () => {
  const [users, setUsers] = useState<UserData[]>([]);

  useEffect(() => {
    const db = getDatabase();
    const usersRef = ref(db, "version12/users");

    const listener = (snapshot: DataSnapshot) => {
      const val = snapshot.val();
      if (!val || typeof val !== "object") {
        setUsers([]);
        return;
      }

      const decryptedUsers: UserData[] = Object.entries(val).map(([userId, userData]) => {
        const user = userData as Record<string, string>; // 👈 This tells TypeScript that userData is an object with string values
      
        return {
          key: userId,
          name: decryptAES(user.name || "N/A"),
          year: decryptAES(user.year || "N/A"),
          email: decryptAES(user.email || "N/A"),
          college: decryptAES(user.college || "N/A"),
          branch: decryptAES(user.branch || "N/A"),
          registrationType: user.RegistrationTime || "N/A",
          registrationDate: user.RegistrationDate || "N/A",
        };
      });
      

      setUsers(decryptedUsers);
    };

    onValue(usersRef, listener);
    return () => off(usersRef, "value", listener);
  }, []);

  // Define table columns
  const columns: TableColumnsType<UserData> = [
    {
      title: "Name",
      dataIndex: "name",
      key: "name",
    },
    {
      title: "Year",
      dataIndex: "year",
      key: "year",
    },
    {
      title: "Email",
      dataIndex: "email",
      key: "email",
    },
    {
      title: "College",
      dataIndex: "college",
      key: "college",
    },
    {
      title: "Branch",
      dataIndex: "branch",
      key: "branch",
    },
    {
      title: "Registration Type",
      dataIndex: "registrationType", // Corrected
      key: "registrationType",
    },
    {
      title: "Registration Date",
      dataIndex: "registrationDate", // Corrected
      key: "registrationDate",
    },
  ];
  

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Users Dashboard</h1>
      <Table<UserData>
        columns={columns}
        dataSource={users}
        pagination={{ pageSize: 10 }}
      />
    </div>
  );
};

export default UserDashboard;


// import React, { useState, useEffect } from "react";
// import { getDatabase, ref, onValue, off, DataSnapshot } from "firebase/database";
// import CryptoJS from "crypto-js";

// const AES_SECRET_KEY = "A1B2C3D4E5F6G7H8"; // Must match Android encryption key

// // Fields to skip decryption
// const SKIP_DECRYPTION_FIELDS = new Set(["ProfileType", "RegistrationDate", "RegistrationTime", "profilePic"]);

// const decryptAES = (encryptedText: string) => {
//   try {
//     const key = CryptoJS.enc.Utf8.parse(AES_SECRET_KEY);
//     const decrypted = CryptoJS.AES.decrypt(encryptedText, key, {
//       mode: CryptoJS.mode.ECB,
//       padding: CryptoJS.pad.Pkcs7,
//     });

//     const decryptedText = decrypted.toString(CryptoJS.enc.Utf8);
//     return decryptedText || encryptedText; // If decryption fails, return original text
//   } catch (error) {
//     console.warn(`Skipping decryption for: ${encryptedText}`);
//     return encryptedText; // Return encrypted value if decryption fails
//   }
// };


// const UserDashboard: React.FC = () => {
//   const [users, setUsers] = useState<Record<string, Record<string, string>>>({});

//   useEffect(() => {
//     const db = getDatabase();
//     const usersRef = ref(db, "version12/users");

//     const listener = (snapshot: DataSnapshot) => {
//       const val = snapshot.val();
//       if (!val || typeof val !== "object") {
//         setUsers({});
//         return;
//       }

//       const decryptedUsers: Record<string, Record<string, string>> = {};
//       Object.entries(val).forEach(([userId, userData]) => {
//         if (typeof userData === "object" && userData !== null) {
//           const decryptedData: Record<string, string> = {};
//           Object.entries(userData).forEach(([key, value]) => {
//             // Skip decryption for specified fields
//             decryptedData[key] =
//               SKIP_DECRYPTION_FIELDS.has(key) || typeof value !== "string"
//                 ? value
//                 : decryptAES(value);
//           });
//           decryptedUsers[userId] = decryptedData;
//         }
//       });

//       setUsers(decryptedUsers);
//     };

//     onValue(usersRef, listener);
//     return () => off(usersRef, "value", listener);
//   }, []);

//   return (
//     <div className="flex flex-col justify-center items-center min-h-screen bg-gray-100 p-4">
//       <h1 className="text-3xl font-bold mb-6">Users Dashboard</h1>
//       <div className="bg-white p-6 rounded shadow-md w-full max-w-2xl">
//         {Object.keys(users).length ? (
//           Object.entries(users).map(([userId, userData]) => (
//             <div key={userId} className="mb-6 border-b pb-4">
//               <h2 className="text-xl font-semibold mb-2">User ID: {userId}</h2>
//               <ul>
//                 {Object.entries(userData).map(([key, value]) => (
//                   <li key={key} className="mb-1">
//                     <span className="font-semibold">{key}</span>: {value}
//                   </li>
//                 ))}
//               </ul>
//             </div>
//           ))
//         ) : (
//           <p className="text-gray-700">No user data available.</p>
//         )}
//       </div>
//     </div>
//   );
// };

// export default UserDashboard;
