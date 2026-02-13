export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-1">Welcome to NorthChat</p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <p className="text-sm font-medium text-gray-500">Calls Today</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">0</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <p className="text-sm font-medium text-gray-500">Messages</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">0</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <p className="text-sm font-medium text-gray-500">Active Contacts</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">0</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <p className="text-sm font-medium text-gray-500">Voicemails</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">0</p>
        </div>
      </div>

      {/* Recent Activity Placeholder */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
        <div className="mt-4 text-center py-12 text-gray-400">
          <p className="text-lg">No activity yet</p>
          <p className="text-sm mt-1">Activity will appear here once you start making calls and sending messages</p>
        </div>
      </div>
    </div>
  )
}
