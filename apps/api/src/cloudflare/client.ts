export type CloudflareErrorItem = {
  readonly code: number;
  readonly message: string;
};

type CloudflareResultInfo = {
  readonly page: number;
  readonly per_page: number;
  readonly total_count: number;
  readonly total_pages: number;
  readonly count: number;
};

type CloudflareResponse<T> = {
  readonly success: boolean;
  readonly result: T;
  readonly errors: readonly CloudflareErrorItem[];
  readonly messages: readonly string[];
  readonly result_info?: CloudflareResultInfo;
};

export type CloudflareZone = {
  readonly id: string;
  readonly name: string;
};

export type CloudflareDnsRecordType = "A" | "AAAA" | "CNAME" | "TXT" | "NS" | "MX" | "SRV" | "PTR" | "CAA" | "LOC" | "CERT" | "DNSKEY" | "DS" | "NAPTR" | "SMIMEA" | "SSHFP" | "SVCB" | "TLSA" | "URI";

export type CloudflareDnsRecord = {
  readonly id: string;
  readonly type: CloudflareDnsRecordType;
  readonly name: string;
  readonly content: string;
  readonly proxied: boolean;
  readonly ttl: number;
};

export type DnsRecordInput = {
  readonly type: "A" | "AAAA";
  readonly name: string;
  readonly content: string;
  readonly proxied: boolean;
  readonly ttl: number;
};

export class CloudflareApiError extends Error {
  public readonly status: number;

  public readonly errors: readonly CloudflareErrorItem[];

  public readonly body?: string;

  constructor(message: string, status: number, errors: readonly CloudflareErrorItem[], body?: string) {
    super(message);
    this.name = "CloudflareApiError";
    this.status = status;
    this.errors = errors;
    this.body = body;
  }
}

type RequestOptions = {
  readonly method?: "GET" | "POST" | "PUT" | "DELETE";
  readonly body?: unknown;
  readonly searchParams?: Record<string, string>;
};

export class CloudflareClient {
  private readonly baseUrl: string;

  private readonly token: string;

  private readonly pageSize: number;

  constructor(token: string, baseUrl: string = "https://api.cloudflare.com/client/v4", pageSize: number = 100) {
    this.token = token;
    this.baseUrl = baseUrl;
    this.pageSize = pageSize;
  }

  public async listZones(): Promise<readonly CloudflareZone[]> {
    return this.fetchAllPages<CloudflareZone>("/zones");
  }

  public async getZoneByName(name: string): Promise<CloudflareZone | null> {
    const params = new URLSearchParams({ name, status: "active", match: "all" });
    const response = await this.request<readonly CloudflareZone[]>(`/zones?${params.toString()}`);
    if (response.result.length === 0) {
      return null;
    }
    return response.result[0] ?? null;
  }

  public async listDnsRecords(
    zoneId: string,
    query?: { readonly name?: string; readonly type?: CloudflareDnsRecordType }
  ): Promise<readonly CloudflareDnsRecord[]> {
    const searchParams: Record<string, string> = {};
    if (query?.name !== undefined) {
      searchParams.name = query.name;
    }
    if (query?.type !== undefined) {
      searchParams.type = query.type;
    }
    return this.fetchAllPages<CloudflareDnsRecord>(`/zones/${zoneId}/dns_records`, searchParams);
  }

  public async createDnsRecord(zoneId: string, input: DnsRecordInput): Promise<CloudflareDnsRecord> {
    const response = await this.request<CloudflareDnsRecord>(`/zones/${zoneId}/dns_records`, {
      method: "POST",
      body: input
    });
    return response.result;
  }

  public async updateDnsRecord(zoneId: string, recordId: string, input: DnsRecordInput): Promise<CloudflareDnsRecord> {
    const response = await this.request<CloudflareDnsRecord>(`/zones/${zoneId}/dns_records/${recordId}`, {
      method: "PUT",
      body: input
    });
    return response.result;
  }

  public async deleteDnsRecord(zoneId: string, recordId: string): Promise<void> {
    await this.request<CloudflareDnsRecord>(`/zones/${zoneId}/dns_records/${recordId}`, {
      method: "DELETE"
    });
  }

  private async fetchAllPages<T>(path: string, params: Record<string, string> = {}): Promise<readonly T[]> {
    const items: T[] = [];
    let page = 1;
    let hasMore = true;
    while (hasMore) {
      const nextParams = new URLSearchParams({
        ...params,
        page: page.toString(),
        per_page: this.pageSize.toString()
      });
      const response = await this.request<readonly T[]>(`${path}?${nextParams.toString()}`);
      items.push(...response.result);
      const info = response.result_info;
      hasMore = info !== undefined && info.page < info.total_pages;
      page += 1;
    }
    return items;
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<CloudflareResponse<T>> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (options.searchParams !== undefined) {
      const params = new URLSearchParams(options.searchParams);
      params.forEach((value, key) => {
        url.searchParams.append(key, value);
      });
    }

    const init: RequestInit = {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json"
      }
    };

    if (options.body !== undefined) {
      init.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, init);
    const rawBody = await response.text();
    let parsed: CloudflareResponse<T> | null = null;
    if (rawBody.length > 0) {
      try {
        parsed = JSON.parse(rawBody) as CloudflareResponse<T>;
      } catch {
        throw new CloudflareApiError("Cloudflare API returned non-JSON response", response.status, [], rawBody);
      }
    }

    if (parsed === null) {
      if (!response.ok) {
        throw new CloudflareApiError(
          `Cloudflare API request failed with status ${response.status}`,
          response.status,
          [],
          rawBody
        );
      }
      throw new CloudflareApiError("Cloudflare API returned an empty response", response.status, [], rawBody);
    }

    if (!response.ok || !parsed.success) {
      throw new CloudflareApiError(
        `Cloudflare API request failed with status ${response.status}`,
        response.status,
        parsed.errors ?? [],
        rawBody
      );
    }
    return parsed;
  }
}

