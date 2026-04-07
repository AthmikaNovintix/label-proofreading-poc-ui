import { createContext, useContext, useState, ReactNode } from "react";
import { ScanLine, User } from "lucide-react";

interface UserInfo {
  name: string;
  role: string;
}

interface UserContextType {
  user: UserInfo;
  setUser: (u: UserInfo) => void;
  logout: () => void;
}

const UserContext = createContext<UserContextType>({
  user: { name: "", role: "" },
  setUser: () => {},
  logout: () => {},
});

export const useUser = () => useContext(UserContext);

const LoginModal = ({ onSubmit }: { onSubmit: (u: UserInfo) => void }) => {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [touched, setTouched] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!name.trim()) return;
    onSubmit({ name: name.trim(), role: role.trim() });
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white shadow-2xl border border-gray-200">
        {/* Modal header */}
        <div className="bg-primary px-6 py-4 flex items-center gap-3">
          <ScanLine className="h-5 w-5 text-white" />
          <div>
            <h1 className="text-sm font-bold text-white uppercase tracking-widest">LabelX Proofreading</h1>
            <p className="text-[11px] text-white/70 mt-0.5">Regulatory Affairs · Document Control</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-6 space-y-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <User className="h-4 w-4 text-primary" />
              <h2 className="text-base font-semibold text-gray-900">Identify Yourself</h2>
            </div>
            <p className="text-xs text-gray-500">
              Your identity will be used to pre-fill the <em>Requested By</em> field on all submissions.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-1.5">
                Full Name <span className="text-primary">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. J. Smith"
                autoFocus
                className={`w-full h-10 border px-3 text-sm bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all ${
                  touched && !name.trim() ? "border-red-400 ring-1 ring-red-300" : "border-gray-300"
                }`}
              />
              {touched && !name.trim() && (
                <p className="mt-1 text-xs text-red-600">Full name is required</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-1.5">
                Role / Department <span className="text-gray-400 font-normal normal-case">(optional)</span>
              </label>
              <input
                type="text"
                value={role}
                onChange={e => setRole(e.target.value)}
                placeholder="e.g. Regulatory Affairs"
                className="w-full h-10 border border-gray-300 px-3 text-sm bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
              />
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              className="bg-primary text-white px-6 py-2.5 text-sm font-semibold uppercase tracking-wider hover:opacity-90 transition-opacity"
            >
              Continue to System
            </button>
          </div>
        </form>

        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 text-[10px] text-gray-400 uppercase tracking-widest text-center">
          Internal Use Only — Controlled Document Environment
        </div>
      </div>
    </div>
  );
};

export const UserProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUserState] = useState<UserInfo>({ name: "", role: "" });
  const [showModal, setShowModal] = useState(true);

  const setUser = (u: UserInfo) => {
    setUserState(u);
  };

  const logout = () => {
    setUserState({ name: "", role: "" });
    setShowModal(true);
  };

  return (
    <UserContext.Provider value={{ user, setUser, logout }}>
      {showModal && !user.name && (
        <LoginModal
          onSubmit={u => {
            setUser(u);
            setShowModal(false);
          }}
        />
      )}
      {children}
    </UserContext.Provider>
  );
};
