
GCS_BUCKET='tattoo-training'
BASE_DIR='/Users/kiril/code/tensorflow/models/research'

pushd $BASE_DIR
bash object_detection/dataset_tools/create_pycocotools_package.sh /tmp/pycocotools/
python setup.py sdist
(cd slim && python setup.py sdist)
popd

gcloud ai-platform jobs submit training `whoami`_tattoo_detection_`date +%m_%d_%Y_%H_%M_%S` \
    --runtime-version 1.12 \
    --job-dir=gs://${GCS_BUCKET}/model_dir \
    --packages ${BASE_DIR}/dist/object_detection-0.1.tar.gz,${BASE_DIR}/slim/dist/slim-0.1.tar.gz,/tmp/pycocotools/pycocotools-2.0.tar.gz \
    --module-name object_detection.model_main \
    --region us-central1 \
    --config ${BASE_DIR}/object_detection/samples/cloud/cloud.yml \
    -- \
    --model_dir=gs://${GCS_BUCKET}/model_dir \
    --pipeline_config_path=gs://${GCS_BUCKET}/data/ssd_mobilenet_v1_tattoos.config
