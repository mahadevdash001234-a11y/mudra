import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { API_ENDPOINTS } from '@/api/endpoints';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Bell,
  CheckCheck,
  Clock,
  AlertCircle,
  FileText,
  CreditCard,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import { useBrandTitle } from '@/hooks/useBrandTitle';

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  eventType: string;
  isRead: boolean;
  createdAt: string;
}

export const CustomerNotificationsPage: React.FC = () => {
  useBrandTitle('Notifications');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<{ data: NotificationItem[]; unreadCount: number }>({
    queryKey: ['customer-notifications'],
    queryFn: async () => {
      const res = await apiClient.get(API_ENDPOINTS.NOTIFICATIONS.CUSTOMER_LIST);
      return res;
    },
    refetchInterval: 10000,
  });

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiClient.patch(API_ENDPOINTS.NOTIFICATIONS.CUSTOMER_MARK_READ(id));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['customer-dashboard'] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      return apiClient.post(API_ENDPOINTS.NOTIFICATIONS.CUSTOMER_READ_ALL);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['customer-dashboard'] });
    },
  });

  const notifications = data?.data || [];
  const unreadCount = data?.unreadCount || 0;

  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case 'LOAN_APPROVED':
      case 'AGREEMENT_ACCEPTED':
        return <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />;
      case 'PAYMENT_SUBMITTED':
      case 'PAYMENT_REJECTED':
        return <CreditCard className="w-5 h-5 text-amber-600 shrink-0" />;
      case 'LOAN_DISBURSED':
        return <CheckCheck className="w-5 h-5 text-emerald-700 shrink-0" />;
      default:
        return <FileText className="w-5 h-5 text-blue-600 shrink-0" />;
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="pb-2 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center space-x-2">
            <Bell className="w-6 h-6 text-primary" />
            <span>Borrower Notifications</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-600">
            Real-time status alerts for KYC, loan reviews, payments, agreements, and disbursements.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending}
              className="text-xs h-8"
            >
              <CheckCheck className="w-3.5 h-3.5 mr-1.5" />
              Mark All Read
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3 animate-pulse">
          <div className="h-16 bg-slate-200 rounded-lg" />
          <div className="h-16 bg-slate-200 rounded-lg" />
          <div className="h-16 bg-slate-200 rounded-lg" />
        </div>
      ) : notifications.length > 0 ? (
        <div className="space-y-3">
          {notifications.map((notif) => (
            <Card
              key={notif.id}
              onClick={() => {
                if (!notif.isRead) markReadMutation.mutate(notif.id);
                const title = (notif.title || '').toLowerCase();
                const msg = (notif.message || '').toLowerCase();
                const event = (notif.eventType || '').toUpperCase();

                if (event.includes('PAYMENT') || title.includes('fee') || title.includes('charge') || title.includes('payment') || msg.includes('utr')) {
                  navigate('/customer/payments');
                } else if (event.includes('AGREEMENT') || title.includes('agreement') || msg.includes('agreement')) {
                  navigate('/customer/loans');
                } else if (event.includes('KYC') || title.includes('kyc') || msg.includes('aadhaar')) {
                  navigate('/customer/kyc');
                } else if (event.includes('DOC') || title.includes('document') || msg.includes('upload') || msg.includes('pan')) {
                  navigate('/customer/documents');
                } else if (event.includes('LOAN') || title.includes('loan') || title.includes('sanction') || title.includes('approval') || msg.includes('disburs')) {
                  navigate('/customer/loans');
                } else {
                  navigate('/customer');
                }
              }}
              className={`border transition-all cursor-pointer ${
                notif.isRead ? 'bg-white border-slate-200' : 'bg-emerald-50/40 border-emerald-300 shadow-sm'
              }`}
            >
              <CardContent className="p-4 flex items-start space-x-3">
                <div className="mt-0.5">{getEventIcon(notif.eventType)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-xs sm:text-sm font-semibold text-slate-900 truncate">{notif.title}</h2>
                    {!notif.isRead && (
                      <Badge className="bg-success text-background text-text-primary text-[10px] h-4 shrink-0">New</Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">{notif.message}</p>
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center space-x-1.5 text-[10px] text-text-secondary">
                      <Clock className="w-3 h-3" />
                      <span>
                        {new Date(notif.createdAt).toLocaleDateString('en-IN', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    {(notif.eventType.includes('PAYMENT') || notif.title.toLowerCase().includes('fee') || notif.title.toLowerCase().includes('charge') || notif.message.toLowerCase().includes('payment')) && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!notif.isRead) markReadMutation.mutate(notif.id);
                          navigate('/customer/payments');
                        }}
                        className="text-[11px] font-bold text-[#155EEF] hover:underline flex items-center gap-1 cursor-pointer bg-transparent border-none p-0"
                      >
                        <span>View Payment</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-slate-200 p-8 text-center">
          <AlertCircle className="w-8 h-8 text-text-secondary mx-auto mb-2" />
          <h2 className="text-sm font-semibold text-slate-700">No Notifications Yet</h2>
          <p className="text-xs text-text-secondary mt-1">
            As your loan application progresses through review, updates will appear here in real-time.
          </p>
        </Card>
      )}
    </div>
  );
};
