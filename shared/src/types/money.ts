/** Money as sent by the API: integer paise plus the backend-formatted display string (API-005). */
export interface Money {
  paise: number;
  display: string;
}
