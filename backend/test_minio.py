"""
MinIO connection test script.
Run: python test_minio.py
"""
import sys
from services.minio_service import get_minio_client, ensure_bucket, upload_file, get_presigned_url
from config import get_settings

def test_minio():
    settings = get_settings()
    print("=" * 60)
    print("MinIO Connection Test")
    print("=" * 60)
    print(f"Endpoint: {settings.minio_endpoint}")
    print(f"Access Key: {settings.minio_access_key}")
    print(f"Secret Key: {'*' * len(settings.minio_secret_key)}")
    print(f"Bucket: {settings.minio_bucket}")
    print(f"Secure: {settings.minio_secure}")
    print("=" * 60)
    
    try:
        # Test 1: Connect to MinIO
        print("\n[1] Testing connection to MinIO...")
        client = get_minio_client()
        print("✓ Successfully connected to MinIO")
        
        # Test 2: List buckets
        print("\n[2] Listing buckets...")
        buckets = client.list_buckets()
        bucket_names = [b.name for b in buckets]
        print(f"✓ Found {len(bucket_names)} bucket(s): {', '.join(bucket_names) if bucket_names else 'none'}")
        
        # Test 3: Ensure bucket exists
        print(f"\n[3] Ensuring bucket '{settings.minio_bucket}' exists...")
        ensure_bucket()
        print(f"✓ Bucket '{settings.minio_bucket}' is ready")
        
        # Test 4: Upload a test file
        print("\n[4] Testing file upload...")
        test_content = b"This is a test file for MinIO connection."
        test_path = upload_file(
            file_data=test_content,
            content_type="text/plain",
            folder="test"
        )
        print(f"✓ File uploaded successfully: {test_path}")
        
        # Test 5: Generate presigned URL
        print("\n[5] Testing presigned URL generation...")
        download_url = get_presigned_url(test_path, expires_seconds=3600)
        print(f"✓ Presigned URL generated (valid for 1 hour):")
        print(f"  {download_url[:80]}...")
        
        # Test 6: Verify file exists
        print("\n[6] Verifying uploaded file...")
        from minio.error import S3Error
        try:
            stat = client.stat_object(settings.minio_bucket, test_path)
            print(f"✓ File verified: {stat.size} bytes, content-type: {stat.content_type}")
        except S3Error as e:
            print(f"✗ Error verifying file: {e}")
            return False
        
        print("\n" + "=" * 60)
        print("✓ All tests passed! MinIO is working correctly.")
        print("=" * 60)
        return True
        
    except Exception as e:
        print(f"\n✗ Error: {e}")
        print("\nTroubleshooting:")
        print("1. Make sure MinIO server is running")
        print("2. Check MINIO_ENDPOINT in .env file (default: localhost:9000)")
        print("3. Verify MINIO_ACCESS_KEY and MINIO_SECRET_KEY are correct")
        print("4. Check if MinIO console is accessible at http://localhost:9001")
        print("5. For Docker: docker ps | grep minio")
        return False

if __name__ == "__main__":
    success = test_minio()
    sys.exit(0 if success else 1)
